import React from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  FileQuestion,
  FilePen,
  FileText,
  Files,
  Film,
  Heart,
  Home,
  type LucideIcon,
  Inbox,
  Landmark,
  LayoutGrid,
  ScrollText,
  Settings,
  Stethoscope,
  Users,
  UsersRound,
  IdCard,
  HandCoins
} from "lucide-react";
import { PERMISSIONS as P, Permission } from "./auth/access";
import { WorkspaceHome } from "./pages/WorkspaceHome";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { TeamPage } from "./pages/TeamPage";
import { Dashboard } from "./pages/Dashboard";
import { BlogsPage } from "./pages/BlogsPage";
import { QAsPage } from "./pages/QAsPage";
import { VideosPage } from "./pages/VideosPage";
import { GuidesPage } from "./pages/GuidesPage";
import { ConditionsPage } from "./pages/ConditionsPage";
import { SchemesPage } from "./pages/SchemesPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { UsersPage } from "./pages/UsersPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SubscriptionsPage } from "./pages/subscriptions/SubscriptionsPage";
import { SchemeApplicationsPage } from "./pages/SchemeApplicationsPage";
import { DoctorsPage } from "./pages/DoctorsPage";
import { ClinicalFinancePage } from "./pages/clinicalFinance/ClinicalFinancePage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { CompanyFilesPage } from "./pages/CompanyFilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PeoplePage } from "./pages/hr/PeoplePage";
import { TemplatesPage } from "./pages/hr/TemplatesPage";

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  element: React.ReactNode;
  /** Shown when the user holds ANY of these. Empty = every staff member. */
  permissions: Permission[];
  /** One-liner used on the Home page's shortcuts. */
  description: string;
  badge?: "approvals";
};

export type NavSection = { id: string; label: string; items: NavItem[] };

/**
 * Single source of truth for the Admin Workspace: the sidebar, the router
 * and the Home page shortcuts are all built from this list, filtered by the
 * signed-in staff member's permissions.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { path: "/", label: "Home", icon: Home, element: <WorkspaceHome />, permissions: [], description: "Your workspace at a glance" },
      {
        path: "/approvals",
        label: "Approvals",
        icon: Inbox,
        element: <ApprovalsPage />,
        permissions: [],
        description: "Review requests and track your own",
        badge: "approvals"
      }
    ]
  },
  {
    id: "content",
    label: "Content",
    items: [
      { path: "/content", label: "Content Overview", icon: LayoutGrid, element: <Dashboard />, permissions: [P.CONTENT_READ], description: "Library health, drafts and recent edits" },
      { path: "/blogs", label: "Blogs", icon: FileText, element: <BlogsPage />, permissions: [P.CONTENT_READ], description: "Articles for the in-app feed" },
      { path: "/qa", label: "Q&A Forum", icon: FileQuestion, element: <QAsPage />, permissions: [P.CONTENT_READ], description: "Expert answers to common questions" },
      { path: "/videos", label: "Video Reels", icon: Film, element: <VideosPage />, permissions: [P.CONTENT_READ], description: "Short-form video and polls" },
      { path: "/guides", label: "Wellbeing Guides", icon: BookOpen, element: <GuidesPage />, permissions: [P.CONTENT_READ], description: "Guided resources and audio" },
      { path: "/conditions", label: "Health Issues", icon: Heart, element: <ConditionsPage />, permissions: [P.CONTENT_READ], description: "Condition explainers" },
      { path: "/schemes", label: "Govt. Schemes", icon: Landmark, element: <SchemesPage />, permissions: [P.CONTENT_READ], description: "Government benefit catalog" }
    ]
  },
  {
    id: "app",
    label: "App & Growth",
    items: [
      { path: "/analytics", label: "Analytics", icon: BarChart3, element: <AnalyticsPage />, permissions: [P.ANALYTICS_READ], description: "Platform usage and revenue" },
      { path: "/users", label: "Users", icon: Users, element: <UsersPage />, permissions: [P.USERS_READ], description: "App accounts and their activity" },
      { path: "/notifications", label: "Push Notifications", icon: Bell, element: <NotificationsPage />, permissions: [P.PUSH_READ], description: "Broadcasts and direct pushes" },
      { path: "/subscriptions", label: "Subscriptions", icon: CreditCard, element: <SubscriptionsPage />, permissions: [P.SUBSCRIPTIONS_READ], description: "Plans, paywall features and coupons" },
      { path: "/scheme-applications", label: "Scheme Applications", icon: ClipboardCheck, element: <SchemeApplicationsPage />, permissions: [P.SCHEME_APPLICATIONS_READ], description: "Review users' benefit applications" }
    ]
  },
  {
    id: "clinical",
    label: "Clinical",
    items: [
      { path: "/gynecologists", label: "Gynecologists", icon: Stethoscope, element: <DoctorsPage />, permissions: [P.DOCTORS_READ], description: "Invite and manage clinicians" },
      // Clinical Admin + Super Admin only (payouts.read).
      { path: "/commission-payouts", label: "Commission & Payouts", icon: HandCoins, element: <ClinicalFinancePage />, permissions: [P.PAYOUTS_READ], description: "Commission rates, doctor wallets and withdrawals" }
    ]
  },
  {
    id: "organisation",
    label: "Organisation",
    items: [
      { path: "/team", label: "Team & Access", icon: UsersRound, element: <TeamPage />, permissions: [P.STAFF_MANAGE], description: "Invite staff and manage roles" },
      { path: "/audit-logs", label: "Audit Logs", icon: ScrollText, element: <AuditLogsPage />, permissions: [P.AUDIT_READ], description: "Every privileged action, recorded" },
      { path: "/people", label: "People & Letters", icon: IdCard, element: <PeoplePage />, permissions: [P.HR_MANAGE], description: "Hires, interns and the letters you send them" },
      { path: "/letter-templates", label: "Letter Templates", icon: FilePen, element: <TemplatesPage />, permissions: [P.HR_MANAGE], description: "Canva letters and certificates, ready to fill" },
      { path: "/company-files", label: "Company Files", icon: Files, element: <CompanyFilesPage />, permissions: [P.COMPANY_FILES_MANAGE], description: "Internal documents" },
      { path: "/settings", label: "Account & Settings", icon: Settings, element: <SettingsPage />, permissions: [], description: "Your account and connection" }
    ]
  }
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section }))
);

/** Sections filtered to what `can` allows; empty sections are dropped. */
export function visibleSections(can: (...p: Permission[]) => boolean): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.permissions.length === 0 || can(...item.permissions))
  })).filter((section) => section.items.length > 0);
}

/** The nav entry for a pathname (used for page eyebrows). */
export const findNavItem = (pathname: string) =>
  ALL_NAV_ITEMS.find((item) => item.path === pathname);
