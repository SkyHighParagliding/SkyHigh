import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Upload as UploadIcon, Check, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";

interface BulkUploadResult {
  filename: string;
  url: string;
  size: string;
  error?: string;
}

interface UploadResult {
  name: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  url?: string;
  error?: string;
}

export interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  onAccept: (results: BulkUploadResult[]) => void;
  maxImages?: number;
}

export function BulkUploadDialog({ open, onOpenChange, token, onAccept, maxImages = 20 }: BulkUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [photographerName, setPhotographerName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(e.currentTarget.files || []);
    if (files.length > maxImages) {
      toast.warning(`Only the first ${maxImages} image${maxImages !== 1 ? "s" : ""} will be uploaded (limit is ${maxImages})`);
      files = files.slice(0, maxImages);
    }
    setSelectedFiles(files);
    setResults([]);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;

    setUploading(true);
    const formData = new FormData();
    selectedFiles.forEach(file => formData.append('images', file));

    const initialResults: UploadResult[] = selectedFiles.map(f => ({
      name: f.name,
      status: 'pending'
    }));
    setResults(initialResults);

    try {
      const encodedName = encodeURIComponent(photographerName.trim() || "_");
      const response = await api.post<BulkUploadResult[]>(`/api/ai/bulk-upload-hero/${encodedName}`, formData, token);

      const updatedResults = selectedFiles.map((file, idx) => {
        const result = response[idx];
        return result && result.url
          ? { name: file.name, status: 'done' as const, url: result.url }
          : { name: file.name, status: 'error' as const, error: result?.error || 'Unknown error' };
      });
      setResults(updatedResults);

      const successCount = updatedResults.filter(r => r.status === 'done').length;
      if (successCount === selectedFiles.length) {
        toast.success(`All ${successCount} images uploaded successfully`);
      } else {
        toast.warning(`${successCount}/${selectedFiles.length} images uploaded successfully`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setResults(selectedFiles.map(f => ({
        name: f.name,
        status: 'error' as const,
        error: errorMsg
      })));
      toast.error(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleDone = () => {
    const successfulResults = results
      .filter(r => r.status === 'done' && r.url)
      .map(r => ({
        filename: r.name,
        url: r.url!,
        size: '—'
      }));

    if (successfulResults.length > 0) {
      onAccept(successfulResults);
    }

    setSelectedFiles([]);
    setPhotographerName("");
    setResults([]);
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (!uploading) {
      setSelectedFiles([]);
      setPhotographerName("");
      setResults([]);
      onOpenChange(false);
    }
  };

  const successCount = results.filter(r => r.status === 'done').length;
  const totalCount = selectedFiles.length;
  const isComplete = uploading === false && results.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload Hero Images</DialogTitle>
          <DialogDescription>
            Select up to <strong>{maxImages}</strong> images to process into the Hero library. All images will be cropped to 1920×1080 centered on the vertical centerline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isComplete && (
            <>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-4 border-2 border-dashed border-sky/30 rounded-lg hover:border-sky hover:bg-sky/5 transition-all text-left"
                >
                  <div className="flex items-center gap-2">
                    <UploadIcon className="w-5 h-5 text-sky" />
                    <span className="font-medium">Choose Files</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFiles.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Photographer Name <span className="text-muted-foreground font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={photographerName}
                  onChange={(e) => setPhotographerName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-sky"
                />
              </div>

              <Button
                onClick={handleUpload}
                disabled={!selectedFiles.length || uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-4 h-4 mr-2" />
                    Upload {selectedFiles.length > 0 ? `${selectedFiles.length} Image${selectedFiles.length !== 1 ? 's' : ''}` : 'Images'}
                  </>
                )}
              </Button>
            </>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                {isComplete
                  ? `Upload complete — ${successCount} of ${totalCount} succeeded`
                  : 'Uploading...'}
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2 bg-muted/30">
                {results.map((result, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm p-1 rounded">
                    <div className="flex-shrink-0 mt-0.5">
                      {result.status === 'pending' && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                      {result.status === 'uploading' && <Loader2 className="w-4 h-4 text-sky animate-spin" />}
                      {result.status === 'done' && <Check className="w-4 h-4 text-emerald-600" />}
                      {result.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="truncate text-foreground block">{result.name}</span>
                      {result.status === 'error' && (
                        <span className="text-xs text-red-500 break-words">{result.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            {!isComplete && (
              <Button variant="outline" onClick={handleCancel} disabled={uploading}>
                Cancel
              </Button>
            )}
            {isComplete && (
              <>
                <Button variant="outline" onClick={handleCancel}>
                  Close
                </Button>
                <Button onClick={handleDone} disabled={successCount === 0}>
                  Add {successCount > 0 ? successCount : 'Images'} to Library
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
