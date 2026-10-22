"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Camera,
  Scale,
  Paperclip,
  AlertTriangle,
  Upload,
  Plus,
  Trash2,
} from "lucide-react";
import {
  getHealthProfile,
  saveHealthProfile,
  uploadFile,
  getFileDownloadUrl,
  type PatientRow,
  type ClientRow,
  type TimelineEvent,
} from "@/lib/api";

type WeightRecord = {
  id: string;
  date: string;
  weightKg: number;
};

type PhotoItem = {
  id: string;
  category: "medical" | "before" | "after" | "grooming" | "general";
  date: string;
  caption: string;
  /** Server file id (current storage). */
  fileId?: string;
  /** Legacy embedded image; only present until migrated to the server. */
  imageUrl?: string;
  svgIcon?: "dog" | "healed" | "bath";
};

type HealthProfileData = {
  breed: string;
  sex: string;
  color: string;
  microchip: string;
  dob: string;
  weights: WeightRecord[];
  notes: string[];
  allergies: string[];
  photos: PhotoItem[];
  avatarFileId?: string;
  /** Legacy embedded avatar; only present until migrated to the server. */
  avatarUrl?: string;
};

/** What is stored on the server; demographics always come from the patient record. */
type StoredHealthProfile = {
  weights: WeightRecord[];
  notes: string[];
  allergies: string[];
  photos: PhotoItem[];
  avatarFileId?: string;
};

function toStored(profile: HealthProfileData): StoredHealthProfile {
  return {
    weights: profile.weights,
    notes: profile.notes,
    allergies: profile.allergies,
    photos: profile.photos.map((photo) => ({ ...photo, imageUrl: undefined })),
    avatarFileId: profile.avatarFileId,
  };
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientRow;
  client?: ClientRow;
  timelineEvents?: TimelineEvent[];
};

export function PatientHealthProfileModal({
  isOpen,
  onClose,
  patient,
  client,
  timelineEvents,
}: Props) {
  // Storage key versioned to v3 to guarantee eviction of old duplicate dummy data
  const storageKey = `vetos_health_profile_v3_${patient.id}`;

  // Extract authentic weight entries logged during consultations / SOAP notes
  const extractTimelineWeights = (): WeightRecord[] => {
    if (!timelineEvents || timelineEvents.length === 0) return [];
    const extracted: WeightRecord[] = [];
    const seenDates = new Set<string>();

    for (const ev of timelineEvents) {
      const searchTarget = `${ev.title || ""} ${ev.subtitle || ""}`;
      const match = searchTarget.match(/(?:weight|wt)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*kg/i);
      if (match && match[1]) {
        const kg = parseFloat(match[1]);
        const date = ev.timestamp
          ? new Date(ev.timestamp).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        if (!seenDates.has(date) && !isNaN(kg) && kg > 0) {
          seenDates.add(date);
          extracted.push({
            id: `w-timeline-${ev.id || Date.now()}`,
            date,
            weightKg: Math.round(kg * 10) / 10,
          });
        }
      }
    }
    return extracted.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const getInitialProfile = (): HealthProfileData => {
    const breed = patient.breed?.trim() || "Mixed / Unspecified";
    const sex = patient.sexCode?.trim() || "Unspecified";
    const color = patient.color?.trim() || "Not specified";
    const microchip = patient.microchip?.trim() || "None";
    const dob = patient.dateOfBirth?.trim() || "";

    const notes: string[] = [];
    if (patient.notes && patient.notes.trim()) {
      notes.push(patient.notes.trim());
    }

    return {
      breed,
      sex,
      color,
      microchip,
      dob,
      weights: extractTimelineWeights(),
      notes,
      allergies: [],
      photos: [],
    };
  };

  const [profile, setProfile] = useState<HealthProfileData>(getInitialProfile);

  // Form input states
  const [newWeightKg, setNewWeightKg] = useState("");
  const [newWeightDate, setNewWeightDate] = useState(new Date().toISOString().slice(0, 10));
  const [showAddWeight, setShowAddWeight] = useState(false);

  const [newNote, setNewNote] = useState("");
  const [newAllergy, setNewAllergy] = useState("");

  const [photoCategory, setPhotoCategory] = useState<"medical" | "before" | "after" | "grooming" | "general">("medical");
  const [photoCaption, setPhotoCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const fromStored = (stored: Partial<StoredHealthProfile>): HealthProfileData => ({
    ...getInitialProfile(),
    weights: stored.weights ?? extractTimelineWeights(),
    notes: stored.notes ?? (patient.notes ? [patient.notes.trim()] : []),
    allergies: stored.allergies ?? [],
    photos: stored.photos ?? [],
    avatarFileId: stored.avatarFileId,
  });

  /** Moves a profile saved in this browser (before profiles moved to the server) up to the server, once. */
  const migrateLegacyProfile = async (): Promise<StoredHealthProfile | null> => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const legacy: HealthProfileData = JSON.parse(raw);
    const isDemoData =
      legacy.weights?.some((w) => ["w-1", "w-2", "w-3", "w-4"].includes(w.id)) ||
      (legacy.allergies?.includes("Penicillin") && legacy.allergies?.includes("Chicken protein")) ||
      legacy.photos?.some((ph) => ["p-1", "p-2", "p-3"].includes(ph.id));
    if (isDemoData) return null;
    const photos: PhotoItem[] = [];
    for (const photo of legacy.photos ?? []) {
      if (photo.imageUrl?.startsWith("data:")) {
        const uploaded = await uploadFile("PATIENT", patient.id, await dataUrlToFile(photo.imageUrl, photo.id + ".jpg"));
        photos.push({ ...photo, imageUrl: undefined, fileId: uploaded.id });
      } else {
        photos.push(photo);
      }
    }
    let avatarFileId: string | undefined;
    if (legacy.avatarUrl?.startsWith("data:")) {
      avatarFileId = (await uploadFile("PATIENT", patient.id, await dataUrlToFile(legacy.avatarUrl, "avatar.jpg"))).id;
    }
    const stored: StoredHealthProfile = {
      weights: legacy.weights ?? [],
      notes: legacy.notes ?? [],
      allergies: legacy.allergies ?? [],
      photos,
      avatarFileId,
    };
    await saveHealthProfile(patient.id, stored);
    return stored;
  };

  // Load from the server (shared by every computer); migrate any browser-only copy once.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadState("loading");
    setStatusError(null);
    (async () => {
      try {
        const response = await getHealthProfile<StoredHealthProfile>(patient.id);
        if (cancelled) return;
        if (response.profile) {
          setProfile(fromStored(response.profile));
        } else {
          const migrated = await migrateLegacyProfile();
          if (cancelled) return;
          setProfile(migrated ? fromStored(migrated) : getInitialProfile());
        }
        try {
          localStorage.removeItem(storageKey);
          localStorage.removeItem("vetos_health_profile_" + patient.id);
          localStorage.removeItem("vetos_health_profile_v2_" + patient.id);
        } catch {
          // Browser storage unavailable; nothing to clean up.
        }
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadState("error");
        setStatusError(error instanceof Error ? error.message : "Could not load the health profile.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, patient.id]);

  // Save to the server; the profile is never kept only in this browser.
  const saveProfile = async (updated: HealthProfileData) => {
    if (loadState !== "ready") {
      setStatusError("The profile is still loading. Try again in a moment.");
      return;
    }
    setProfile(updated);
    setSaving(true);
    setStatusError(null);
    try {
      await saveHealthProfile(patient.id, toStored(updated));
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Could not save the health profile.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Calculate age from actual DOB
  const calculateAge = (dobString?: string | null) => {
    if (!dobString) return "Unknown";
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return "Unknown";
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years === 0 && months === 0) {
      const days = Math.max(1, Math.floor((now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24)));
      return `${days} days`;
    }
    if (years === 0) return `${months} mos`;
    return `${years} yrs ${months} mos`;
  };

  // Weight max scale for progress bar calculation
  const maxWeightInList = Math.max(
    20,
    ...profile.weights.map((w) => w.weightKg)
  );

  const handleAddWeight = () => {
    const kg = parseFloat(newWeightKg);
    if (isNaN(kg) || kg <= 0) return;
    const newEntry: WeightRecord = {
      id: `w-${Date.now()}`,
      date: newWeightDate || new Date().toISOString().slice(0, 10),
      weightKg: Math.round(kg * 10) / 10,
    };
    const updated = {
      ...profile,
      weights: [...profile.weights, newEntry].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    };
    saveProfile(updated);
    setNewWeightKg("");
    setShowAddWeight(false);
  };

  const handleDeleteWeight = (id: string) => {
    const updated = {
      ...profile,
      weights: profile.weights.filter((w) => w.id !== id),
    };
    saveProfile(updated);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    const updated = {
      ...profile,
      notes: [...profile.notes, newNote.trim()],
    };
    saveProfile(updated);
    setNewNote("");
  };

  const handleAddAllergy = () => {
    if (!newAllergy.trim()) return;
    if (profile.allergies.includes(newAllergy.trim())) {
      setNewAllergy("");
      return;
    }
    const updated = {
      ...profile,
      allergies: [...profile.allergies, newAllergy.trim()],
    };
    saveProfile(updated);
    setNewAllergy("");
  };

  const handleRemoveAllergy = (allergyToRemove: string) => {
    const updated = {
      ...profile,
      allergies: profile.allergies.filter((a) => a !== allergyToRemove),
    };
    saveProfile(updated);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatusError(null);
    try {
      const uploaded = await uploadFile("PATIENT", patient.id, file);
      const newPhoto: PhotoItem = {
        id: "p-" + Date.now(),
        category: photoCategory,
        date: new Date().toISOString().slice(0, 10),
        caption: photoCaption.trim() || photoCategory.toUpperCase() + " photo",
        fileId: uploaded.id,
      };
      await saveProfile({ ...profile, photos: [...profile.photos, newPhoto] });
      setPhotoCaption("");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatusError(null);
    try {
      const uploaded = await uploadFile("PATIENT", patient.id, file);
      await saveProfile({ ...profile, avatarFileId: uploaded.id, avatarUrl: undefined });
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleDeletePhoto = (id: string) => {
    const updated = {
      ...profile,
      photos: profile.photos.filter((p) => p.id !== id),
    };
    saveProfile(updated);
  };

  const speciesDisplayName =
    patient.speciesCode === "FELINE"
      ? "Cat"
      : patient.speciesCode === "CANINE"
      ? "Dog"
      : patient.speciesCode || "Patient";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            {patient.name}&rsquo;s Health Profile
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {(loadState === "loading" || saving || uploading || statusError) && (
            <div
              className={
                "rounded-lg border px-3 py-2 text-xs " +
                (statusError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-600")
              }
            >
              {statusError ??
                (loadState === "loading" ? "Loading health profile…" : uploading ? "Uploading photo…" : "Saving…")}
            </div>
          )}

          {/* Pet Identity Card Banner */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {/* Pet Avatar */}
              <div className="relative group">
                <div className="h-14 w-14 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center overflow-hidden shadow-2xs">
                  {profile.avatarFileId || profile.avatarUrl ? (
                    <img
                      src={profile.avatarFileId ? getFileDownloadUrl(profile.avatarFileId) : profile.avatarUrl}
                      alt={patient.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl select-none" role="img" aria-label="Pet">
                      {patient.speciesCode === "FELINE" ? "🐱" : "🐕"}
                    </span>
                  )}
                </div>
              </div>

              {/* Patient Basic Info */}
              <div>
                <h4 className="text-xl font-extrabold text-slate-900 capitalize leading-tight">
                  {patient.name}
                </h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {speciesDisplayName} • {profile.breed} • {profile.sex} • {profile.color}
                </p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Microchip:{" "}
                  {profile.microchip && profile.microchip !== "None" ? (
                    <span className="font-mono text-slate-700">{profile.microchip}</span>
                  ) : (
                    <span className="text-slate-400">Not microchipped</span>
                  )}
                  {" "}• DOB:{" "}
                  {profile.dob ? (
                    <span>{profile.dob} • Age: {calculateAge(profile.dob)}</span>
                  ) : (
                    <span className="text-slate-400">Not recorded</span>
                  )}
                </p>
              </div>
            </div>

            {/* Photo Action Button */}
            <div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                <Camera className="h-3.5 w-3.5 text-slate-500" />
                Photo
              </button>
            </div>
          </div>

          {/* Two Column Grid: Weight History & Medical Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Weight History */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                  <Scale className="h-3.5 w-3.5 text-slate-500" />
                  WEIGHT HISTORY
                </h5>
                <button
                  type="button"
                  onClick={() => setShowAddWeight(!showAddWeight)}
                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-0.5"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>

              {/* Add Weight Inline Form */}
              {showAddWeight && (
                <div className="p-2.5 rounded-lg border border-teal-100 bg-teal-50/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={newWeightDate}
                      onChange={(e) => setNewWeightDate(e.target.value)}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                    />
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Weight kg"
                      value={newWeightKg}
                      onChange={(e) => setNewWeightKg(e.target.value)}
                      className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={handleAddWeight}
                      className="rounded bg-teal-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-teal-800"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Weight Progress Bar List */}
              <div className="space-y-2.5">
                {profile.weights.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
                    <Scale className="h-5 w-5 text-slate-300 mx-auto mb-1" />
                    <p className="text-xs font-medium text-slate-600">No weight history recorded</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Click <strong className="text-teal-700">+ Add</strong> to log this patient&rsquo;s weight
                    </p>
                  </div>
                ) : (
                  profile.weights.map((w) => {
                    const percent = Math.min(100, Math.max(15, (w.weightKg / maxWeightInList) * 100));
                    return (
                      <div key={w.id} className="flex items-center justify-between gap-3 text-xs group">
                        <span className="font-mono text-[11px] text-slate-500 w-20 shrink-0">
                          {w.date}
                        </span>
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-600 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="font-bold text-xs text-slate-800 w-12 text-right shrink-0">
                          {w.weightKg}kg
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteWeight(w.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity ml-1"
                          title="Delete weight"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Medical Notes & Allergies */}
            <div className="space-y-3">
              <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                MEDICAL NOTES &amp; ALLERGIES
              </h5>

              {/* Notes Box */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-700 leading-relaxed min-h-[48px] space-y-1.5">
                {profile.notes.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No clinical notes recorded yet for this patient.</p>
                ) : (
                  profile.notes.map((note, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 group">
                      <p className="text-slate-700">{note}</p>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...profile,
                            notes: profile.notes.filter((_, i) => i !== idx),
                          };
                          saveProfile(updated);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 text-[10px] shrink-0"
                        title="Delete note"
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add Note Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Add medical note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-800 shrink-0 transition"
                >
                  Add
                </button>
              </div>

              {/* Allergies Pill Badges */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 min-h-[28px]">
                {profile.allergies.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">No known drug or food allergies recorded</span>
                ) : (
                  profile.allergies.map((allergy) => (
                    <span
                      key={allergy}
                      className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/70 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700"
                    >
                      {allergy}
                      <button
                        type="button"
                        onClick={() => handleRemoveAllergy(allergy)}
                        className="hover:text-rose-900 font-bold ml-0.5 text-[10px]"
                        title="Remove allergy"
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Add Allergy Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Add allergy..."
                  value={newAllergy}
                  onChange={(e) => setNewAllergy(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddAllergy()}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddAllergy}
                  className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-800 shrink-0 transition"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Photo Gallery */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h5 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5 text-slate-500" />
                PHOTO GALLERY
              </h5>
              <span className="text-[11px] text-slate-400">
                {profile.photos.length} photos
              </span>
            </div>

            {/* Photo Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {profile.photos.length === 0 ? (
                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center">
                  <Camera className="h-7 w-7 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-slate-600">No photos uploaded for this patient</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Attach medical progress, pre/post procedure, or grooming pictures below.
                  </p>
                </div>
              ) : (
                profile.photos.map((item) => (
                  <div
                    key={item.id}
                    className="group relative rounded-xl border border-slate-200 bg-white p-3 flex flex-col items-center justify-between text-center shadow-2xs hover:shadow-xs transition"
                  >
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(item.id)}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 rounded-full bg-slate-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Remove photo"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>

                    <div className="h-28 w-full rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden my-2">
                      {item.fileId || item.imageUrl ? (
                        <img
                          src={item.fileId ? getFileDownloadUrl(item.fileId) : item.imageUrl}
                          alt={item.caption}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-2 text-slate-300">
                          <Camera className="h-8 w-8 mx-auto" />
                        </div>
                      )}
                    </div>

                    <div className="w-full">
                      <p className="text-[11px] font-medium text-slate-500">
                        {item.category} • {item.date}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate max-w-full mt-0.5" title={item.caption}>
                        {item.caption}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Upload Row */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <select
                value={photoCategory}
                onChange={(e) => setPhotoCategory(e.target.value as any)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-teal-600"
              >
                <option value="medical">medical</option>
                <option value="before">before</option>
                <option value="after">after</option>
                <option value="grooming">grooming</option>
                <option value="general">general</option>
              </select>

              <input
                type="text"
                placeholder="Caption (optional)"
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
                className="flex-1 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-600"
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-800 shadow-2xs transition"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
