"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil, Plus, Power, Trash2, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HalaqahCard } from "@/components/halaqah/halaqah-card";
import type { HalaqahListItem } from "@/lib/halaqah-shared";
import {
  deleteHalaqahAction,
  moveStudentHalaqahAction,
  saveHalaqahAction,
  setHalaqahActiveAction,
  setHalaqahMembersAction,
  setHalaqahTeachersAction,
} from "@/app/actions/halaqah";

type TeacherOption = { id: string; name: string; code: string };
type StudentOption = { id: string; name: string; code: string; halaqahId: string | null };

/**
 * TAHFIZH V8 — Admin manager (rule #4/#8/#9/#11): CRUD + pengampu + anggota +
 * pindah halaqah (with history). Deleting blocks when used (soft policy).
 */
export function HalaqahManager({
  items,
  teachers,
  students,
  role,
  halaqahLabel,
  studentLabel,
}: {
  items: HalaqahListItem[];
  teachers: TeacherOption[];
  students?: StudentOption[];
  role: "admin" | "koordinator";
  halaqahLabel: string;
  studentLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");

  // form dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HalaqahListItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // V12: saat membuat halaqah, guru pengampu & santri bisa langsung dipilih.
  const [formTeachers, setFormTeachers] = useState<string[]>([]);
  const [formStudents, setFormStudents] = useState<string[]>([]);

  const [teacherOpen, setTeacherOpen] = useState<HalaqahListItem | null>(null);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);

  const [memberOpen, setMemberOpen] = useState<HalaqahListItem | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  const filtered = items.filter((h) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      h.name.toLowerCase().includes(q) ||
      h.businessCode.toLowerCase().includes(q) ||
      h.teacherNames.toLowerCase().includes(q)
    );
  });

  function run(fn: () => Promise<{ error?: string; success?: string }>, after?: () => void) {
    startTransition(async () => {
      try {
        const res = await fn();
        setMessage(res.error ? { kind: "err", text: res.error } : { kind: "ok", text: res.success || "Berhasil." });
        if (!res.error) {
          after?.();
          router.refresh();
        }
      } catch {
        setMessage({ kind: "err", text: "Data belum berhasil disimpan. Silakan coba lagi." });
      }
    });
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setFormTeachers([]);
    setFormStudents([]);
    setFormOpen(true);
  }
  function openEdit(h: HalaqahListItem) {
    setEditing(h);
    setName(h.name);
    setDescription(h.description);
    setFormTeachers([]);
    setFormStudents([]);
    setFormOpen(true);
  }
  function openTeachers(h: HalaqahListItem) {
    setTeacherOpen(h);
    setSelectedTeachers(h.teacherIds ?? []);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Cari nama ${halaqahLabel.toLowerCase()}, kode, atau guru...`}
          className="max-w-xs"
          aria-label={`Cari ${halaqahLabel}`}
        />
        {role === "admin" ? (
          <Button className="bg-primary text-white" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> {halaqahLabel} Baru
          </Button>
        ) : null}
      </div>

      {message ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          )}
          role="status"
        >
          {message.text}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground/80">
          Belum ada {halaqahLabel.toLowerCase()}.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((h, i) => (
            <div key={h.id} className="space-y-2">
              {/* Kartu berwarna + nama rata tengah (V12) */}
              <HalaqahCard
                item={h}
                index={i}
                studentLabel={studentLabel}
                href={`/${role}/halaqah/${h.id}`}
              />
              {role === "admin" ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <Button size="sm" variant="outline" className="h-8 text-[0.8rem]" onClick={() => openTeachers(h)}>
                    <UserPlus className="mr-0.5 h-3.5 w-3.5" /> Pengampu
                  </Button>
                  {students ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[0.8rem]"
                      onClick={() => {
                        setMemberOpen(h);
                        // Pracentang anggota yang sudah tergabung di halaqah ini.
                        setSelectedStudents((students ?? []).filter((s) => s.halaqahId === h.id).map((s) => s.id));
                      }}
                    >
                      <Users className="mr-0.5 h-3.5 w-3.5" /> Anggota
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(h)} aria-label={`Edit ${h.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={pending}
                    title={h.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                    onClick={() => run(() => setHalaqahActiveAction({ halaqahId: h.id, active: h.status !== "ACTIVE" }))}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-red-600 dark:text-red-300"
                    disabled={pending}
                    title="Hapus (hanya jika belum dipakai)"
                    onClick={() => run(() => deleteHalaqahAction({ halaqahId: h.id }))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${halaqahLabel}` : `${halaqahLabel} Baru`}</DialogTitle>
            <DialogDescription>
              Nama mengikuti kebutuhan lembaga — kode {halaqahLabel.toLowerCase()} dibuat otomatis (H-1, H-2, ...).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Halaqah Al-Fatih" />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi (opsional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className="min-h-[64px]" />
            </div>

            {!editing && teachers.length > 0 && (
              <div className="space-y-1.5">
                <Label>Guru Pengampu (opsional — bisa juga diatur nanti)</Label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1">
                  {teachers.map((t) => (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={formTeachers.includes(t.id)}
                        onCheckedChange={(v) =>
                          setFormTeachers((prev) => (v ? [...prev, t.id] : prev.filter((id) => id !== t.id)))
                        }
                      />
                      <span className="font-medium text-foreground/85">{t.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[0.7rem] text-muted-foreground/80">Guru pertama menjadi pengampu utama.</p>
              </div>
            )}

            {!editing && (students ?? []).length > 0 && (
              <div className="space-y-1.5">
                <Label>{studentLabel} Anggota (opsional — bisa juga diatur nanti)</Label>
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-1">
                  {(students ?? []).map((s) => (
                    <label
                      key={s.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted/50",
                        s.halaqahId ? "opacity-60" : ""
                      )}
                    >
                      <Checkbox
                        checked={formStudents.includes(s.id)}
                        onCheckedChange={(v) =>
                          setFormStudents((prev) => (v ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                        }
                      />
                      <span className="font-medium text-foreground/85">{s.name}</span>
                      {s.halaqahId ? (
                        <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground/80">
                          sudah di {halaqahLabel.toLowerCase()} lain
                        </Badge>
                      ) : null}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button
              className="bg-role text-role-ink"
              disabled={pending || name.trim().length < 2}
              onClick={() =>
                run(async () => {
                  const res = await saveHalaqahAction({ halaqahId: editing?.id ?? null, name, description });
                  if (res.error || !res.id) return res;
                  // V12: langsung set pengampu & anggota bila dipilih saat create.
                  if (formTeachers.length > 0) {
                    await setHalaqahTeachersAction({
                      halaqahId: res.id,
                      teacherIds: formTeachers,
                      primaryId: formTeachers[0],
                    });
                  }
                  if (formStudents.length > 0) {
                    await setHalaqahMembersAction({ halaqahId: res.id, studentIds: formStudents });
                  }
                  return res;
                }, () => setFormOpen(false))
              }
            >
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pengampu dialog (rule #8: N guru, satu utama) */}
      <Dialog open={teacherOpen !== null} onOpenChange={(o) => !o && setTeacherOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guru Pengampu — {teacherOpen?.name}</DialogTitle>
            <DialogDescription>
              Pilih satu atau lebih guru; guru pertama menjadi pengampu utama.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {teachers.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-[0.92rem] hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedTeachers.includes(t.id)}
                  onCheckedChange={(v) =>
                    setSelectedTeachers((prev) => (v ? [...prev, t.id] : prev.filter((id) => id !== t.id)))
                  }
                />
                <span className="font-medium text-foreground/85">{t.name}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeacherOpen(null)}>
              Batal
            </Button>
            <Button
              className="bg-role text-role-ink"
              disabled={pending || selectedTeachers.length === 0 || !teacherOpen}
              onClick={() =>
                run(
                  () =>
                    setHalaqahTeachersAction({
                      halaqahId: teacherOpen!.id,
                      teacherIds: selectedTeachers,
                      primaryId: selectedTeachers[0],
                    }),
                  () => setTeacherOpen(null)
                )
              }
            >
              {pending ? "Menyimpan..." : "Simpan Pengampu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members dialog (rule #9/#11: transfers keep history) */}
      <Dialog open={memberOpen !== null} onOpenChange={(o) => !o && setMemberOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anggota — {memberOpen?.name}</DialogTitle>
            <DialogDescription>
              Centang {studentLabel.toLowerCase()} anggota {halaqahLabel.toLowerCase()} ini. Memindahkan santri dari{" "}
              {halaqahLabel.toLowerCase()} lain akan menutup keanggotaan lama — histori tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {(students ?? []).map((s) => {
              const inThis = memberOpen ? selectedStudents.includes(s.id) : false;
              const elsewhere = s.halaqahId && memberOpen && s.halaqahId !== memberOpen.id;
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50",
                    elsewhere ? "border-amber-200 bg-amber-50/50" : "border-slate-100"
                  )}
                >
                  <Checkbox
                    checked={inThis}
                    onCheckedChange={(v) =>
                      setSelectedStudents((prev) => (v ? [...prev, s.id] : prev.filter((id) => id !== s.id)))
                    }
                  />
                  <span className="font-medium text-foreground/85">{s.name}</span>
                  {elsewhere ? (
                    <Badge variant="outline" className="ml-auto border-amber-300 dark:border-amber-500/30 text-[10px] text-amber-700 dark:text-amber-300">
                      pindah
                    </Badge>
                  ) : null}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberOpen(null)}>
              Batal
            </Button>
            <Button
              className="bg-role text-role-ink"
              disabled={pending || !memberOpen}
              onClick={() =>
                run(
                  () => setHalaqahMembersAction({ halaqahId: memberOpen!.id, studentIds: selectedStudents }),
                  () => setMemberOpen(null)
                )
              }
            >
              {pending ? "Menyimpan..." : "Simpan Anggota"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
