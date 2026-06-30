import { Loader2, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeleteDialog({
  open,
  onOpenChange,
  agentName,
  deleting,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string | null;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete assistant?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes &quot;{agentName}&quot; and all its
            configuration. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2Icon className="size-4" aria-hidden="true" />
                Delete assistant
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
