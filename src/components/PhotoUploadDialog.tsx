import { useState, useRef } from "react";
import { X, Upload, AlertCircle, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (imageBuffer: string) => Promise<void>;
  isLoading?: boolean;
  contactName?: string;
}

export function PhotoUploadDialog({
  isOpen,
  onClose,
  onUpload,
  isLoading = false,
  contactName = "this contact",
}: PhotoUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, or WebP)");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB");
      return;
    }

    setFile(selectedFile);
    setError("");

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setError("");
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        await onUpload(base64);
        setFile(null);
        setPreview("");
        onClose();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-lg font-bold text-navy">Upload Photo</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {preview && (
            <div className="mx-auto w-32 h-32 rounded-lg overflow-hidden border-2 border-border">
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Select Image
            </label>
            <div
              className="relative border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-sky hover:bg-sky/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileSelect}
                disabled={isLoading}
                className="hidden"
              />
              <div className="space-y-2">
                {file ? (
                  <>
                    <Camera className="w-8 h-8 text-sky mx-auto" />
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">Click to change</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      Click to select or take a photo
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              <strong>Important:</strong> By uploading this image you consent to it being displayed. Do not press upload if you do not consent.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || isLoading}
              className="flex-1 bg-navy hover:bg-navy-light text-white"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" /> Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
