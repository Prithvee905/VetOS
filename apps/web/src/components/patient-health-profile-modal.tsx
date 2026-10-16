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
import type { PatientRow, ClientRow, TimelineEvent } from "@/lib/api";

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
  avatarUrl?: string;
};

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
}: Props) {
  // Local storage key for persistent profile data per patient
  const storageKey = `vetos_health_profile_${patient.id}`;

  const defaultProfile = (): HealthProfileData => ({
    breed: patient.breed || "Golden Retriever",
    sex: patient.sexCode || "Male",
    color: patient.color || "Golden",
    microchip: patient.microchip || `MC-987654321`,
    dob: patient.dateOfBirth || "2022-04-15",
    weights: [
      { id: "w-1", date: "2025-01-10", weightKg: 29.0 },
      { id: "w-2", date: "2025-06-15", weightKg: 30.2 },
      { id: "w-3", date: "2026-02-10", weightKg: 31.0 },
      { id: "w-4", date: "2026-09-10", weightKg: 31.5 },
    ],
    notes: [patient.notes || "Mild hip dysplasia observed during growth."],
    allergies: ["Penicillin", "Chicken protein"],
    photos: [
      {
        id: "p-1",
        category: "before",
        date: "2026-05-10",
        caption: "Pre-surgery skin lesion",
        svgIcon: "dog",
      },
      {
        id: "p-2",
        category: "after",
        date: "2026-05-20",
        caption: "Post-healing",
        svgIcon: "healed",
      },
      {
        id: "p-3",
        category: "grooming",
        date: "2026-08-01",
        caption: "Post-spa grooming",
        svgIcon: "bath",
      },
    ],
  });

  const [profile, setProfile] = useState<HealthProfileData>(defaultProfile);

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

  // Load from localStorage or initialize with defaults
  useEffect(() => {
    if (!isOpen) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setProfile(parsed);
      } else {
        const initial = defaultProfile();
        setProfile(initial);
        localStorage.setItem(storageKey, JSON.stringify(initial));
      }
    } catch {
      setProfile(defaultProfile());
    }
  }, [isOpen, patient.id]);

  // Save changes to localStorage
  const saveProfile = (updated: HealthProfileData) => {
    setProfile(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save health profile:", e);
    }
  };

  if (!isOpen) return null;

  // Calculate age from DOB
  const calculateAge = (dobString: string) => {
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return "4 yrs 5 mos";
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    return `${years} yrs ${months} mos`;
  };

  // Weight max scale for progress bar calculation
  const maxWeightInList = Math.max(
    35,
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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const newPhoto: PhotoItem = {
        id: `p-${Date.now()}`,
        category: photoCategory,
        date: new Date().toISOString().slice(0, 10),
        caption: photoCaption.trim() || `${photoCategory.toUpperCase()} photo`,
        imageUrl: dataUrl,
      };
      const updated = {
        ...profile,
        photos: [...profile.photos, newPhoto],
      };
      saveProfile(updated);
      setPhotoCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const updated = {
        ...profile,
        avatarUrl: dataUrl,
      };
      saveProfile(updated);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleDeletePhoto = (id: string) => {
    const updated = {
      ...profile,
      photos: profile.photos.filter((p) => p.id !== id),
    };
    saveProfile(updated);
  };

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
          {/* Pet Identity Card Banner (Matches Screenshot) */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {/* Pet Avatar */}
              <div className="relative group">
                <div className="h-14 w-14 rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center overflow-hidden shadow-2xs">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
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
                  {patient.speciesCode === "FELINE" ? "Cat" : "Dog"} • {profile.breed} • {profile.sex} • {profile.color}
                </p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Microchip: <span className="font-mono text-slate-700">{profile.microchip}</span> • DOB: {profile.dob} • Age: {calculateAge(profile.dob)}
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
                      <p className="text-xs text-slate-400 py-3">No weights recorded yet.</p>
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
                  <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-700 leading-relaxed min-h-[44px] space-y-1">
                    {profile.notes.map((note, idx) => (
                      <p key={idx} className="text-slate-700">{note}</p>
                    ))}
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
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {profile.allergies.map((allergy) => (
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
                    ))}
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

              {/* Photo Gallery (Matches Screenshot) */}
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

                {/* 3-Column Photo Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {profile.photos.map((item) => (
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

                      {/* Image / Thumbnail Container */}
                      <div className="h-28 w-full rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden my-2">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.caption}
                            className="h-full w-full object-cover"
                          />
                        ) : item.svgIcon === "dog" ? (
                          <div className="text-center p-2">
                            <span className="text-4xl">🐕‍🦺</span>
                          </div>
                        ) : item.svgIcon === "healed" ? (
                          <div className="text-center p-2">
                            <span className="text-4xl">🐕</span>
                          </div>
                        ) : (
                          <div className="text-center p-2">
                            <span className="text-4xl">🛁</span>
                          </div>
                        )}
                      </div>

                      {/* Photo Captions (Exact format from screenshot) */}
                      <div className="w-full">
                        <p className="text-[11px] font-medium text-slate-500">
                          {item.category} • {item.date}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate max-w-full mt-0.5" title={item.caption}>
                          {item.caption}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upload Row (Exact controls from screenshot) */}
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
