"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Upload, Download, FileText, CheckCircle, AlertCircle, Trash2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFile, listFiles, getFileDownloadUrl, type FileResponse } from "@/lib/api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string;
};

export function FileAttachmentsModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  title,
  subtitle,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filesQuery = useQuery<FileResponse[]>({
    queryKey: ["files", entityType, entityId],
    queryFn: () => listFiles(entityType, entityId),
    enabled: isOpen && Boolean(entityId),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("Please select a file to upload");
      return uploadFile(entityType, entityId, selectedFile);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["files", entityType, entityId] });
      setUploadSuccess(`Successfully attached "${data.fileName}"!`);
      setErrorMessage(null);
      setSelectedFile(null);
      const input = document.getElementById("file-upload-input") as HTMLInputElement;
      if (input) input.value = "";
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Failed to upload file");
      setUploadSuccess(null);
    },
  });

  if (!isOpen) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Paperclip className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">
                {subtitle || "Attach lab reports, imaging scans, and diagnostic documents"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Upload Box */}
        <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/40 p-4 space-y-3">
          <label className="block text-xs font-semibold text-purple-950">
            Upload Diagnostic Document or Report (PDF, PNG, JPG, DOCX)
          </label>
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <input
              id="file-upload-input"
              type="file"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                  setErrorMessage(null);
                  setUploadSuccess(null);
                }
              }}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200 cursor-pointer"
            />
            <Button
              size="sm"
              type="button"
              disabled={!selectedFile || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="bg-purple-700 hover:bg-purple-800 text-white shrink-0 gap-1.5 shadow-xs w-full sm:w-auto"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploadMutation.isPending ? "Uploading…" : "Upload"}
            </Button>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-1.5 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{uploadSuccess}</span>
            </div>
          )}
        </div>

        {/* Existing Files List */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Attached Documents ({filesQuery.data?.length ?? 0})
          </h4>

          {filesQuery.isLoading ? (
            <p className="text-xs text-slate-400 py-3 text-center">Loading attachments…</p>
          ) : (filesQuery.data || []).length === 0 ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 text-center text-xs text-slate-400">
              No files attached to this record yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              {(filesQuery.data || []).map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 hover:bg-slate-50/80 transition">
                  <div className="flex items-center gap-2.5 truncate pr-2">
                    <FileText className="h-4 w-4 text-purple-600 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-900 truncate">{file.fileName}</p>
                      <p className="text-[10px] text-slate-400">{formatSize(file.byteSize)}</p>
                    </div>
                  </div>
                  <a
                    href={getFileDownloadUrl(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition shrink-0"
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
