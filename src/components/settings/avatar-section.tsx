"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";

import { uploadAvatarAction, deleteAvatarAction, type ProfileResult } from "@/app/actions/profile";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";

export function AvatarSection({
  displayName,
  avatarUrl,
  canDelete,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  canDelete: boolean;
}) {
  const [state, formAction, pending] = useActionState<ProfileResult | null, FormData>(
    uploadAvatarAction,
    null
  );
  const [removeState, removeAction, removing] = useActionState<ProfileResult | null, FormData>(
    async () => deleteAvatarAction(),
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setPreview(null);
    } else if (state?.error) {
      toast.error(state.error);
      setPreview(null);
    }
  }, [state]);

  useEffect(() => {
    if (removeState?.success) toast.success(removeState.success);
    else if (removeState?.error) toast.error(removeState.error);
  }, [removeState]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      formRef.current?.requestSubmit(); // upload immediately on pick
    }
  }

  const shown = preview ?? avatarUrl;

  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={displayName} className="size-20 rounded-2xl object-cover ring-1 ring-slate-200" />
        ) : (
          <div className="bg-gradient-brand flex size-20 items-center justify-center rounded-2xl text-2xl font-bold text-white">
            {displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}

        <form ref={formRef} action={formAction}>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            id="avatar-file"
            onChange={onFileChange}
          />
          <label
            htmlFor="avatar-file"
            aria-label="Ganti foto profil"
            className="bg-gradient-brand absolute -right-1.5 -bottom-1.5 flex size-8 cursor-pointer items-center justify-center rounded-full text-white shadow-md ring-2 ring-white transition-opacity hover:opacity-90"
          >
            {pending ? <Spinner className="size-3.5" /> : <Camera className="size-4" />}
          </label>
        </form>
      </div>

      <div className="min-w-0">
        <p className="font-semibold text-foreground">{displayName}</p>
        <p className="text-muted-foreground text-xs">JPG, PNG, atau WebP · maks 2 MB</p>
        {canDelete && (
          <form action={removeAction} className="mt-2">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={removing}
              className="h-7 px-2 text-xs text-red-600 dark:text-red-300 hover:bg-red-50"
            >
              <Trash2 className="size-3.5" /> Hapus foto
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
