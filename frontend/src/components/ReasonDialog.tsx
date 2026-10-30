"use client";

import { Loader2 } from "lucide-react";
import { useId, useState } from "react";

import { errorMessage } from "@/api/errors";
import { useCaseAction, type CaseAction } from "@/api/queries";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ReasonCopy = {
  trigger: string;
  title: string;
  description: string;
  reason: string;
  placeholder: string;
  required: string;
  cancel: string;
  submit: string;
};

type ReasonDialogProps = {
  requestId: string;
  action: CaseAction;
  copy: ReasonCopy;
  triggerVariant: ButtonProps["variant"];
  submitVariant: ButtonProps["variant"];
};

/** An action on a decision that needs a written reason the other side reads; saved once it is given. */
export function ReasonDialog({ requestId, action, copy, triggerVariant, submitVariant }: ReasonDialogProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const mutation = useCaseAction(requestId, action);
  const missing = !reason.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTried(false);
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>{copy.trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (missing) return;
            mutation.mutate(reason.trim(), {
              onSuccess: () => {
                setOpen(false);
              },
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={id}>{copy.reason}</Label>
            <Textarea
              id={id}
              value={reason}
              autoFocus
              placeholder={copy.placeholder}
              aria-required
              aria-invalid={tried && missing ? true : undefined}
              aria-describedby={tried && missing ? `${id}-error` : undefined}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            {tried && missing ? (
              <p id={`${id}-error`} className="text-data text-destructive">
                {copy.required}
              </p>
            ) : null}
            {mutation.isError ? (
              <p role="alert" className="text-data text-destructive">
                {errorMessage(mutation.error)}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{copy.cancel}</Button>
            </DialogClose>
            <Button type="submit" variant={submitVariant} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
