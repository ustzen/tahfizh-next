"use client";

/**
 * V39 — Resolver terpusat komponen Phosphor Icons.
 *
 * Satu-satunya file yang meng-import `@phosphor-icons/react` langsung.
 * Import dibuat EKSPLISIT per ikon (subpath `dist/csr/<Nama>`, sesuai exports
 * map paket) supaya tree-shakeable — hanya ikon katalog yang ter-bundle.
 * Barrel utama tidak dipakai karena menarik seluruh ~1.500 ikon.
 *
 * Nama ikon berasal dari katalog `src/lib/menu-icons.ts`.
 */

import { SquaresFourIcon } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { GridFourIcon } from "@phosphor-icons/react/dist/csr/GridFour";
import { LayoutIcon } from "@phosphor-icons/react/dist/csr/Layout";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { HouseSimpleIcon } from "@phosphor-icons/react/dist/csr/HouseSimple";
import { CompassIcon } from "@phosphor-icons/react/dist/csr/Compass";
import { RocketIcon } from "@phosphor-icons/react/dist/csr/Rocket";
import { LightningIcon } from "@phosphor-icons/react/dist/csr/Lightning";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { StarIcon } from "@phosphor-icons/react/dist/csr/Star";
import { StarFourIcon } from "@phosphor-icons/react/dist/csr/StarFour";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { BankIcon } from "@phosphor-icons/react/dist/csr/Bank";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/csr/UsersThree";
import { PersonIcon } from "@phosphor-icons/react/dist/csr/Person";
import { ChalkboardTeacherIcon } from "@phosphor-icons/react/dist/csr/ChalkboardTeacher";
import { GraduationCapIcon } from "@phosphor-icons/react/dist/csr/GraduationCap";
import { StudentIcon } from "@phosphor-icons/react/dist/csr/Student";
import { IdentificationCardIcon } from "@phosphor-icons/react/dist/csr/IdentificationCard";
import { CrownIcon } from "@phosphor-icons/react/dist/csr/Crown";
import { HandshakeIcon } from "@phosphor-icons/react/dist/csr/Handshake";
import { BookIcon } from "@phosphor-icons/react/dist/csr/Book";
import { BookOpenIcon } from "@phosphor-icons/react/dist/csr/BookOpen";
import { BookBookmarkIcon } from "@phosphor-icons/react/dist/csr/BookBookmark";
import { BookmarkSimpleIcon } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { BooksIcon } from "@phosphor-icons/react/dist/csr/Books";
import { ScrollIcon } from "@phosphor-icons/react/dist/csr/Scroll";
import { ArticleIcon } from "@phosphor-icons/react/dist/csr/Article";
import { NewspaperIcon } from "@phosphor-icons/react/dist/csr/Newspaper";
import { MosqueIcon } from "@phosphor-icons/react/dist/csr/Mosque";
import { MoonStarsIcon } from "@phosphor-icons/react/dist/csr/MoonStars";
import { HandsPrayingIcon } from "@phosphor-icons/react/dist/csr/HandsPraying";
import { HandHeartIcon } from "@phosphor-icons/react/dist/csr/HandHeart";
import { WaveformIcon } from "@phosphor-icons/react/dist/csr/Waveform";
import { ClipboardTextIcon } from "@phosphor-icons/react/dist/csr/ClipboardText";
import { ClipboardIcon } from "@phosphor-icons/react/dist/csr/Clipboard";
import { ListChecksIcon } from "@phosphor-icons/react/dist/csr/ListChecks";
import { CheckSquareIcon } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CheckFatIcon } from "@phosphor-icons/react/dist/csr/CheckFat";
import { NotebookIcon } from "@phosphor-icons/react/dist/csr/Notebook";
import { NoteIcon } from "@phosphor-icons/react/dist/csr/Note";
import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { QueueIcon } from "@phosphor-icons/react/dist/csr/Queue";
import { ExamIcon } from "@phosphor-icons/react/dist/csr/Exam";
import { CertificateIcon } from "@phosphor-icons/react/dist/csr/Certificate";
import { MedalIcon } from "@phosphor-icons/react/dist/csr/Medal";
import { TrophyIcon } from "@phosphor-icons/react/dist/csr/Trophy";
import { SealCheckIcon } from "@phosphor-icons/react/dist/csr/SealCheck";
import { TargetIcon } from "@phosphor-icons/react/dist/csr/Target";
import { CrosshairIcon } from "@phosphor-icons/react/dist/csr/Crosshair";
import { IntersectIcon } from "@phosphor-icons/react/dist/csr/Intersect";
import { FlagIcon } from "@phosphor-icons/react/dist/csr/Flag";
import { ScalesIcon } from "@phosphor-icons/react/dist/csr/Scales";
import { PercentIcon } from "@phosphor-icons/react/dist/csr/Percent";
import { ChartBarIcon } from "@phosphor-icons/react/dist/csr/ChartBar";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/csr/ChartLineUp";
import { PresentationIcon } from "@phosphor-icons/react/dist/csr/Presentation";
import { BroadcastIcon } from "@phosphor-icons/react/dist/csr/Broadcast";
import { CalendarCheckIcon } from "@phosphor-icons/react/dist/csr/CalendarCheck";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/csr/CalendarBlank";
import { ClockIcon } from "@phosphor-icons/react/dist/csr/Clock";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { CardsIcon } from "@phosphor-icons/react/dist/csr/Cards";
import { CardholderIcon } from "@phosphor-icons/react/dist/csr/Cardholder";
import { HandCoinsIcon } from "@phosphor-icons/react/dist/csr/HandCoins";
import { WalletIcon } from "@phosphor-icons/react/dist/csr/Wallet";
import { MoneyIcon } from "@phosphor-icons/react/dist/csr/Money";
import { CoinsIcon } from "@phosphor-icons/react/dist/csr/Coins";
import { CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/csr/CurrencyCircleDollar";
import { ChatsCircleIcon } from "@phosphor-icons/react/dist/csr/ChatsCircle";
import { ChatsTeardropIcon } from "@phosphor-icons/react/dist/csr/ChatsTeardrop";
import { ChatCenteredDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCenteredDots";
import { ChatCircleDotsIcon } from "@phosphor-icons/react/dist/csr/ChatCircleDots";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/csr/ChatCircleText";
import { ChatTextIcon } from "@phosphor-icons/react/dist/csr/ChatText";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/csr/PaperPlaneRight";
import { WhatsappLogoIcon } from "@phosphor-icons/react/dist/csr/WhatsappLogo";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/csr/EnvelopeSimple";
import { BellIcon } from "@phosphor-icons/react/dist/csr/Bell";
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { GearSixIcon } from "@phosphor-icons/react/dist/csr/GearSix";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { PaintBrushIcon } from "@phosphor-icons/react/dist/csr/PaintBrush";
import { PaletteIcon } from "@phosphor-icons/react/dist/csr/Palette";
import { ImagesIcon } from "@phosphor-icons/react/dist/csr/Images";
import { ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { FilesIcon } from "@phosphor-icons/react/dist/csr/Files";
import { FolderOpenIcon } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { LockKeyIcon } from "@phosphor-icons/react/dist/csr/LockKey";
import { LifebuoyIcon } from "@phosphor-icons/react/dist/csr/Lifebuoy";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { WarningIcon } from "@phosphor-icons/react/dist/csr/Warning";
import { ProhibitIcon } from "@phosphor-icons/react/dist/csr/Prohibit";
import { TrashSimpleIcon } from "@phosphor-icons/react/dist/csr/TrashSimple";
import { BroomIcon } from "@phosphor-icons/react/dist/csr/Broom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowsDownUpIcon } from "@phosphor-icons/react/dist/csr/ArrowsDownUp";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { MapTrifoldIcon } from "@phosphor-icons/react/dist/csr/MapTrifold";
import { PathIcon } from "@phosphor-icons/react/dist/csr/Path";
import { SignpostIcon } from "@phosphor-icons/react/dist/csr/Signpost";
import { TreeStructureIcon } from "@phosphor-icons/react/dist/csr/TreeStructure";
import { FlowArrowIcon } from "@phosphor-icons/react/dist/csr/FlowArrow";
import { PuzzlePieceIcon } from "@phosphor-icons/react/dist/csr/PuzzlePiece";

export type PhosphorIconComponent = React.ComponentType<{ className?: string }>;

/** Peta nama katalog -> komponen Phosphor. */
const PHOSPHOR_MAP: Record<string, PhosphorIconComponent> = {
  SquaresFour: SquaresFourIcon,
  GridFour: GridFourIcon,
  Layout: LayoutIcon,
  House: HouseIcon,
  HouseSimple: HouseSimpleIcon,
  Compass: CompassIcon,
  Rocket: RocketIcon,
  Lightning: LightningIcon,
  Sparkle: SparkleIcon,
  Star: StarIcon,
  StarFour: StarFourIcon,
  Buildings: BuildingsIcon,
  Bank: BankIcon,
  Users: UsersIcon,
  UsersThree: UsersThreeIcon,
  Person: PersonIcon,
  ChalkboardTeacher: ChalkboardTeacherIcon,
  GraduationCap: GraduationCapIcon,
  Student: StudentIcon,
  IdentificationCard: IdentificationCardIcon,
  Crown: CrownIcon,
  Handshake: HandshakeIcon,
  Book: BookIcon,
  BookOpen: BookOpenIcon,
  BookBookmark: BookBookmarkIcon,
  BookmarkSimple: BookmarkSimpleIcon,
  Books: BooksIcon,
  Scroll: ScrollIcon,
  Article: ArticleIcon,
  Newspaper: NewspaperIcon,
  Mosque: MosqueIcon,
  MoonStars: MoonStarsIcon,
  HandsPraying: HandsPrayingIcon,
  HandHeart: HandHeartIcon,
  Waveform: WaveformIcon,
  ClipboardText: ClipboardTextIcon,
  Clipboard: ClipboardIcon,
  ListChecks: ListChecksIcon,
  CheckSquare: CheckSquareIcon,
  CheckCircle: CheckCircleIcon,
  CheckFat: CheckFatIcon,
  Notebook: NotebookIcon,
  Note: NoteIcon,
  PencilSimple: PencilSimpleIcon,
  Queue: QueueIcon,
  Exam: ExamIcon,
  Certificate: CertificateIcon,
  Medal: MedalIcon,
  Trophy: TrophyIcon,
  SealCheck: SealCheckIcon,
  Target: TargetIcon,
  Crosshair: CrosshairIcon,
  Intersect: IntersectIcon,
  Flag: FlagIcon,
  Scales: ScalesIcon,
  Percent: PercentIcon,
  ChartBar: ChartBarIcon,
  ChartLineUp: ChartLineUpIcon,
  Presentation: PresentationIcon,
  Broadcast: BroadcastIcon,
  CalendarCheck: CalendarCheckIcon,
  CalendarBlank: CalendarBlankIcon,
  Clock: ClockIcon,
  ClockCounterClockwise: ClockCounterClockwiseIcon,
  Cards: CardsIcon,
  Cardholder: CardholderIcon,
  HandCoins: HandCoinsIcon,
  Wallet: WalletIcon,
  Money: MoneyIcon,
  Coins: CoinsIcon,
  CurrencyCircleDollar: CurrencyCircleDollarIcon,
  ChatsCircle: ChatsCircleIcon,
  ChatsTeardrop: ChatsTeardropIcon,
  ChatCenteredDots: ChatCenteredDotsIcon,
  ChatCircleDots: ChatCircleDotsIcon,
  ChatCircleText: ChatCircleTextIcon,
  ChatText: ChatTextIcon,
  PaperPlaneRight: PaperPlaneRightIcon,
  WhatsappLogo: WhatsappLogoIcon,
  EnvelopeSimple: EnvelopeSimpleIcon,
  Bell: BellIcon,
  Gear: GearIcon,
  GearSix: GearSixIcon,
  SlidersHorizontal: SlidersHorizontalIcon,
  PaintBrush: PaintBrushIcon,
  Palette: PaletteIcon,
  Images: ImagesIcon,
  Image: ImageIcon,
  Files: FilesIcon,
  FolderOpen: FolderOpenIcon,
  ShieldCheck: ShieldCheckIcon,
  LockKey: LockKeyIcon,
  Lifebuoy: LifebuoyIcon,
  Question: QuestionIcon,
  Info: InfoIcon,
  Warning: WarningIcon,
  Prohibit: ProhibitIcon,
  TrashSimple: TrashSimpleIcon,
  Broom: BroomIcon,
  ArrowCounterClockwise: ArrowCounterClockwiseIcon,
  ArrowsDownUp: ArrowsDownUpIcon,
  ArrowsClockwise: ArrowsClockwiseIcon,
  MagnifyingGlass: MagnifyingGlassIcon,
  DownloadSimple: DownloadSimpleIcon,
  UploadSimple: UploadSimpleIcon,
  MapTrifold: MapTrifoldIcon,
  Path: PathIcon,
  Signpost: SignpostIcon,
  TreeStructure: TreeStructureIcon,
  FlowArrow: FlowArrowIcon,
  PuzzlePiece: PuzzlePieceIcon,
};

/** Ambil komponen Phosphor berdasar nama katalog; null bila tidak dikenal. */
export function getPhosphorIcon(name: string | null | undefined): PhosphorIconComponent | null {
  if (!name) return null;
  return PHOSPHOR_MAP[name] ?? null;
}
