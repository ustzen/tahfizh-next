/**
 * TAHFIZH V12.14 — verifikasi parser & validasi import Excel Guru/Santri.
 *
 * Menjalankan src/lib/import-shared.ts (modul murni yang dipakai dialog import
 * DAN server action) terhadap berbagai bentuk file: contoh bawaan aplikasi,
 * variasi judul kolom, angka 0 di depan, CSV koma/titik-koma, dsb.
 *
 *   node scripts/verify-import.mjs      (Node >= 22.18, type-stripping bawaan)
 */
import * as XLSX from "xlsx";
import assert from "node:assert/strict";
import { parseSheetMatrix, previewValidate, canonicalizeRow, validateStudentRow, validateTeacherRow, TEACHER_IMPORT_COLUMNS, STUDENT_IMPORT_COLUMNS } from "../src/lib/import-shared.ts";

let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log("  ✓", name); } catch (e) { console.log("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const read = (buf, csv=false) => {
  const wb = csv ? XLSX.read(buf,{type:"string",raw:true}) : XLSX.read(buf,{type:"array"});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return { matrix: XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:"",blankrows:true}), first: XLSX.utils.decode_range(ws["!ref"]).s.r+1 };
};
const aoaBook = (aoa, opts) => { const ws = XLSX.utils.aoa_to_sheet(aoa, opts); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S"); return XLSX.write(wb,{type:"array",bookType:"xlsx"}); };

// ---- file contoh bawaan (mirror sample generator di client)
function sampleBook(kind) {
  const cols = kind==="guru" ? TEACHER_IMPORT_COLUMNS : STUDENT_IMPORT_COLUMNS;
  const S = kind==="guru" ? {
    A:i=>`1985001${i}`,B:i=>`Ustadz Contoh Ke-${i}`,C:i=>`Ust. Contoh ${i}`,D:()=>"",E:()=>"S.Pd",F:i=>i%2===1?"L":"P",G:()=>"",
    H:i=>`0812345678${String(i).padStart(2,"0")}`,I:i=>`ustadz${i}`,J:i=>`ustadz${i}1234`} : {
    A:i=>`2026${String(i).padStart(4,"0")}`,B:i=>`${String(i).padStart(2,"0")}00123456`,C:i=>`Santri Contoh Ke-${i}`,D:i=>`Contoh ${i}`,
    E:i=>i%2===1?"L":"P",F:i=>`Bapak Wali ${i}`,G:(i)=>i<=5?"H-1":"",H:i=>`0898765432${String(i).padStart(2,"0")}`};
  const header = Object.fromEntries(cols.map(c=>[c.key,c.label]));
  const rows = []; for (let i=1;i<=10;i++) rows.push(Object.fromEntries(cols.map(c=>[c.key,S[c.key](i)])));
  const ws = XLSX.utils.json_to_sheet([header,...rows],{header:cols.map(c=>c.key),skipHeader:true});
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "x");
  return XLSX.write(wb,{type:"array",bookType:"xlsx"});
}

console.log("File contoh bawaan aplikasi");
for (const kind of ["santri","guru"]) t(`contoh ${kind}: 10 baris terbaca & valid semua`, () => {
  const { matrix, first } = read(sampleBook(kind));
  const sheet = parseSheetMatrix(kind, matrix, first);
  assert.equal(sheet.rows.length, 10);
  assert.equal(sheet.positional, false);
  const v = previewValidate(kind, sheet.rows);
  assert.deepEqual(v.issues, []); assert.equal(v.valid, 10);
});

console.log("Variasi header");
t("header huruf kecil + spasi berlebih", () => {
  const b = aoaBook([["  nama  lengkap ","JENIS KELAMIN","nis"],["Ahmad Zain","laki-laki","0012"]]);
  const { matrix, first } = read(b); const s = parseSheetMatrix("santri", matrix, first);
  const r = validateStudentRow(s.rows[0], 2); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.value.fullName,"Ahmad Zain"); assert.equal(r.value.gender,"L"); assert.equal(r.value.nis,"0012");
});
t('header berawalan urutan "A. NIS | B. NISN | C. Nama Lengkap"', () => {
  const b = aoaBook([["A. NIS","B. NISN","C. Nama Lengkap","E. Jenis Kelamin (L/P)"],["1","1234567890","Siti Aisyah","P"]]);
  const { matrix, first } = read(b); const s = parseSheetMatrix("santri", matrix, first);
  assert.equal(s.positional,false); const r = validateStudentRow(s.rows[0],2); assert.ok(r.ok); assert.equal(r.value.gender,"P");
});
t("urutan kolom bebas (dipetakan lewat judul)", () => {
  const b = aoaBook([["Jenis Kelamin","Nama Lengkap","Nama Panggilan"],["L","Umar","Umar"]]);
  const { matrix, first } = read(b); const s = parseSheetMatrix("santri", matrix, first);
  const r = validateStudentRow(s.rows[0],2); assert.ok(r.ok); assert.equal(r.value.fullName,"Umar");
});
t("header huruf kolom polos (A,B,C…) — format lama", () => {
  const b = aoaBook([["A","B","C","D","E"],["1","","Fulan","Ful","L"]]);
  const { matrix, first } = read(b); const s = parseSheetMatrix("santri", matrix, first);
  const r = validateStudentRow(s.rows[0],2); assert.ok(r.ok); assert.equal(r.value.fullName,"Fulan");
});
t("tanpa header dikenali → urutan kolom (positional)", () => {
  const b = aoaBook([["No Induk","NomorNasional","Nama Anak","Panggil","JK"],["1","1234567890","Fulanah","Fulan","P"]]);
  const { matrix, first } = read(b); const s = parseSheetMatrix("santri", matrix, first);
  assert.equal(s.positional,true); const r = validateStudentRow(s.rows[0],2); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.value.fullName,"Fulanah");
});
t("judul/baris kosong di atas header → header ditemukan, nomor baris benar", () => {
  const b = aoaBook([["DATA SANTRI TPQ"],[""],["Nama Lengkap","Jenis Kelamin"],["Budi","L"],["","" ],["Ani","P"]]);
  const { matrix, first } = read(b); const s = parseSheetMatrix("santri", matrix, first);
  assert.equal(s.headerRow,3); assert.equal(s.rows.length,2); assert.equal(s.rows[0].__row,"4"); assert.equal(s.rows[1].__row,"6");
});
t("kolom wajib tak ditemukan → pesan jelas", () => {
  const b = aoaBook([["NIS","NISN"],["1","2"]]);
  const { matrix, first } = read(b);
  assert.throws(() => parseSheetMatrix("santri", matrix, first), /Nama Lengkap/);
});

console.log("Angka & format");
t("NISN numerik kehilangan 0 di depan dipulihkan; WA tanpa 0 dipulihkan", () => {
  const b = aoaBook([["Nama Lengkap","Jenis Kelamin","NISN","No. WhatsApp Wali"],["Budi","L",12345678,81234567890]]);
  const { matrix, first } = read(b); const s = parseSheetMatrix("santri", matrix, first);
  assert.equal(s.rows[0].B,"0012345678"); assert.equal(s.rows[0].H,"081234567890");
  assert.ok(validateStudentRow(s.rows[0],2).ok);
});
t("WA dengan spasi/strip dibersihkan", () => {
  const r = validateStudentRow({ C:"Budi", E:"L", H:"0812-3456 7890" }, 2); assert.ok(r.ok); assert.equal(r.value.guardianWhatsapp,"081234567890");
});
t("gender: Ikhwan/Akhwat/Laki-laki/Perempuan/Pria/Wanita", () => {
  for (const [g,e] of [["Ikhwan","L"],["akhwat","P"],["Laki-laki","L"],["Perempuan","P"],["Pria","L"],["Wanita","P"],["l","L"],["p","P"]]) { const r = validateStudentRow({C:"Budi",E:g},2); assert.ok(r.ok, g); assert.equal(r.value.gender,e,g); }
  assert.equal(validateStudentRow({C:"Budi",E:"x"},2).ok,false);
});
t("NISN < 10 digit: pesan menyebut format Teks", () => {
  const r = validateStudentRow({ C:"Budi", E:"L", B:"123" },2); assert.equal(r.ok,false); assert.match(r.reason,/Teks/);
});
t("duplikat NIS/NISN dalam file terdeteksi di pratinjau", () => {
  const rows = [{__row:"2",C:"A B",E:"L",A:"1"},{__row:"3",C:"C D",E:"P",A:"1"}];
  const v = previewValidate("santri", rows); assert.equal(v.valid,1); assert.match(v.issues[0].reason,/duplikat dengan baris 2/);
});

console.log("CSV");
t("CSV koma, nol di depan terjaga", () => {
  const { matrix, first } = read("NIS,NISN,Nama Lengkap,Jenis Kelamin (L/P)\n0012,0012345678,Ahmad Zain,L\n", true);
  const s = parseSheetMatrix("santri", matrix, first); assert.equal(s.rows[0].A,"0012"); assert.equal(s.rows[0].B,"0012345678"); assert.ok(validateStudentRow(s.rows[0],2).ok);
});
t("CSV titik-koma (Excel Indonesia)", () => {
  const { matrix, first } = read("Nama Lengkap;Jenis Kelamin (L/P);No. WhatsApp\nSiti;P;081234567890\n", true);
  const s = parseSheetMatrix("guru", matrix, first); const r = validateTeacherRow(s.rows[0],2); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.value.whatsapp,"081234567890");
});

console.log("Guru — username/password");
t("hasil Export guru (username tanpa password) sekarang valid", () => {
  const r = validateTeacherRow({ B:"Ahmad", F:"L", I:"ahmad" },2); assert.ok(r.ok); assert.equal(r.value.password,"");
});
t("password < 8 karakter ditolak", () => { assert.equal(validateTeacherRow({B:"Ahmad",F:"L",I:"ahmad",J:"123"},2).ok,false); });
t("username tidak valid ditolak", () => { assert.equal(validateTeacherRow({B:"Ahmad",F:"L",I:"A B!"},2).ok,false); });

console.log("Server: canonicalizeRow (payload dari klien mana pun)");
t("kunci lama huruf-campuran / snake_case / huruf kolom", () => {
  const a = canonicalizeRow("santri", { "Nama Lengkap":"Budi", "Jenis Kelamin (L/P)":"L", nis:"5", __row: 7 });
  assert.equal(a.C,"Budi"); assert.equal(a.E,"L"); assert.equal(a.A,"5"); assert.equal(a.__row,"7");
  const b = canonicalizeRow("santri", { C:"Ani", E:"P", full_name:"IGNORED-DUP" }); assert.equal(b.C,"Ani");
  const c = canonicalizeRow("santri", { "NAMA LENGKAP":"Uppercase Client", "JENIS KELAMIN (L/P)":"P" }); assert.equal(c.C,"Uppercase Client");
  assert.deepEqual(canonicalizeRow("santri", null), {}); assert.deepEqual(canonicalizeRow("santri", [1,2]), {});
});
t("nilai non-string dipaksa string", () => { assert.equal(canonicalizeRow("santri",{C:12345,E:"L"}).C,"12345"); });

console.log(`\n${pass} tes lulus`);
