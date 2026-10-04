"use client";

import React, { useState } from "react";
import {
  useCreateFollowUpMutation,
  useUpdateFollowUpStatusMutation,
  useDeleteFollowUpMutation,
} from "@/lib/redux/api/followupsApi";
import { Plus, CheckCircle2, Clock, Loader2, Calendar, AlertCircle, Trash2 } from "lucide-react";
import { FollowUpStatus } from "@/lib/db/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ActiveLoanOption {
  id: string;
  loanNumber: string;
  customerName: string;
}

export function NewFollowUpModal({ loans }: { loans: ActiveLoanOption[] }) {
  const [createFollowUp, { isLoading: loading }] = useCreateFollowUpMutation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [loanId, setLoanId] = useState(loans[0]?.id || "");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState(
    () => new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanId || !note.trim()) {
      setError("Please select a loan and enter reminder note");
      return;
    }

    setError(null);

    const res = await createFollowUp({ loanId, note, dueDateStr: dueDate });
    if ("error" in res) {
      setError((res.error as { message?: string })?.message || "Failed to create reminder");
      return;
    }

    setNote("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          onClick={() => {
            setOpen(true);
            setError(null);
          }}
          className="shadow-md shadow-amber-500/10"
        >
          <Plus className="w-4 h-4" />
          New Follow-up Task
        </Button>
      </DialogTrigger>
      <DialogContent className="border-(--accent-border)">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-(--accent)" />
            <span>Schedule Reminder Task</span>
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Select Active Loan Contract *</Label>
            <Select value={loanId} onChange={(e) => setLoanId(e.target.value)} required>
              {loans.map((l) => (
                <option key={l.id} value={l.id} className="bg-(--bg-input) text-(--text-primary)">
                  {l.loanNumber} • {l.customerName}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Reminder Action Note *</Label>
            <Input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Call customer regarding overdue interest payment"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Target Follow-up Date *</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="text-(--text-secondary)"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Schedule Task"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FollowUpStatusButton({
  id,
  currentStatus,
}: {
  id: string;
  currentStatus: FollowUpStatus;
}) {
  const [updateFollowUpStatus, { isLoading: loading }] = useUpdateFollowUpStatusMutation();

  const toggleStatus = async () => {
    const nextStatus: FollowUpStatus = currentStatus === "DONE" ? "PENDING" : "DONE";
    await updateFollowUpStatus({ id, status: nextStatus });
  };

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-(--accent)" />;
  }

  if (currentStatus === "DONE") {
    return (
      <button
        onClick={toggleStatus}
        title="Mark as Pending"
        className="text-(--accent) hover:opacity-80 transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
      >
        <CheckCircle2 className="w-4 h-4 fill-emerald-500/20" />
        Done
      </button>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={toggleStatus}
      title="Mark as Completed"
      className="hover:border-(--accent-border) hover:text-(--accent)"
    >
      <Clock className="w-3.5 h-3.5 text-(--accent)" />
      Mark Done
    </Button>
  );
}

export function DeleteFollowUpButton({ id }: { id: string }) {
  const [deleteFollowUp, { isLoading: loading }] = useDeleteFollowUpMutation();
  const [open, setOpen] = useState(false);

  const handleDelete = async () => {
    await deleteFollowUp(id);
    setOpen(false);
  };

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-red-400" />;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Delete Reminder"
        className="p-1.5 rounded-lg text-(--text-muted) hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-red-500/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              <span>Confirm Reminder Deletion</span>
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reminder task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
              className="font-bold flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Delete Task
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
