import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";

interface UnsavedChangesModalProps {
  blocker: any;
  onSave: () => Promise<void> | void;
}

export function UnsavedChangesModal({ blocker, onSave }: UnsavedChangesModalProps) {
  if (blocker.state !== "blocked") return null;

  const handleSaveAndLeave = async () => {
    try {
      await onSave();
      setTimeout(() => blocker.proceed(), 400);
    } catch {
      blocker.reset();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-navy">Unsaved Changes</h3>
          </div>
          <button onClick={() => blocker.reset()} className="p-2 hover:bg-muted rounded-lg">
            <X className="w-5 h-5 text-foreground-faint" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-foreground-secondary">You have unsaved changes. Would you like to save them before leaving?</p>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-background rounded-b-lg">
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => blocker.proceed()}
          >
            Discard
          </Button>
          <Button
            className="bg-navy hover:bg-navy-light text-white"
            onClick={handleSaveAndLeave}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
