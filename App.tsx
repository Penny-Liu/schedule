import React, { lazy, Suspense, useState, useEffect } from "react";
import { AdministrativeCategory, User, LeaveStatus, UserRole } from "./types";
import Sidebar from "./components/Sidebar";
import LoginPage from "./pages/LoginPage";
import { db } from "./services/store";
import { AlertTriangle, Loader2 } from "lucide-react";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import { isPasswordMigrationReadyForRole } from "./services/passwordPolicy.mjs";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const LeavePage = lazy(() => import("./pages/LeavePage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const StatisticsPage = lazy(() => import("./pages/StatisticsPage"));
const DoctorManagerPage = lazy(() => import("./pages/DoctorManagerPage"));
const PhysicianSchedulePage = lazy(() => import("./pages/PhysicianSchedulePage"));
const PhysicianSettingsPage = lazy(() => import("./pages/PhysicianSettingsPage"));
const DoctorStatisticsPage = lazy(() => import("./pages/DoctorStatisticsPage"));
const CloudSchedulePage = lazy(() => import("./pages/CloudSchedulePage"));
const HealthMgmtPage = lazy(() => import("./pages/HealthMgmtPage"));
const AdministrativeSchedulePage = lazy(() => import("./pages/AdministrativeSchedulePage"));
const MeetingRoomPage = lazy(() => import("./pages/MeetingRoomPage"));
const GenePage = lazy(() => import("./pages/GenePage"));
const SkillDashboardPage = lazy(() => import("./pages/SkillDashboardPage"));
// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 text-red-900 h-screen flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <div className="bg-white p-4 rounded shadow border border-red-200 max-w-lg overflow-auto">
            <code className="text-sm font-mono text-red-600">
              {this.state.error?.message || "Unknown Error"}
            </code>
          </div>
          <button
            className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Init Data from Supabase & Auto-Refresh Setup
  useEffect(() => {
    const init = async () => {
      try {
        await db.initializeAuthData();
        setAuthError(db.authLoadError);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "無法載入登入資料");
      } finally {
        setIsLoading(false);
      }
    };
    init();

    // Auto-refresh on resume
    import("@capacitor/app").then(({ App: CapApp }) => {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          console.log("App resumed, refreshing data...");
          db.initializeAuthData(true);
        }
      });
    });
  }, []);

  const handleLogin = async (user: User) => {
    setIsLoading(true);
    setCurrentUser(user);
    db.currentUser = user;

    // During the legacy-to-Auth transition, weak-password users may authenticate
    // only far enough to replace their password. Do not load application data yet.
    if (user.mustChangePassword || !isPasswordMigrationReadyForRole(user.password, user.role)) {
      setIsLoading(false);
      return;
    }
    
    try {
      await db.initializeDataForUser(user);
    } catch (e) {
      console.error("Error loading user data", e);
    }
    
    setIsLoading(false);

    // Redirect logic by role/department
    if (
      user.isHealthMgmt ||
      user.role === UserRole.HM_SUPERVISOR ||
      user.role === UserRole.HM_STAFF
    ) {
      setCurrentPage("health_mgmt");
    } else if (
      user.role === UserRole.PHYSICIAN_ADMIN ||
      user.role === UserRole.SCHEDULER ||
      user.role === UserRole.VIEWER
    ) {
      setCurrentPage("physician_schedule");
    } else if (user.role === UserRole.FINANCE) {
      setCurrentPage("doctor_statistics");
    } else if (
      user.role === UserRole.SUPERVISOR ||
      user.role === UserRole.SYSTEM_ADMIN ||
      user.role === UserRole.RADIOGRAPHER_STAFF ||
      user.isRadiographer
    ) {
      setCurrentPage("dashboard");
    } else {
      setCurrentPage("dashboard");
    }
  };

  const handleLogout = () => {
    db.logout();
    setCurrentUser(null);
  };

  // --- Notification Logic ---
  const [hasPendingLeaves, setHasPendingLeaves] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const checkNotifications = () => {
      const leaves = db.getLeaves();
      let hasPending = false;

      if (
        currentUser.role === "SUPERVISOR" ||
        currentUser.role === "SYSTEM_ADMIN"
      ) {
        // Supervisor: Check for any PENDING leaves
        hasPending = leaves.some((l) => l.status === LeaveStatus.PENDING);
      }

      if (!hasPending) {
        // All Users: Check for Swap requests needing their agreement
        hasPending = leaves.some(
          (l) =>
            l.targetUserId === currentUser.id && l.targetApproval === "PENDING",
        );
      }

      setHasPendingLeaves(hasPending);
    };

    // Initial check
    checkNotifications();

    // Subscribe to store updates
    const unsubscribe = db.subscribe(checkNotifications);
    return () => unsubscribe();
  }, [currentUser]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 size={48} className="animate-spin text-teal-600 mb-4" />
        <p className="text-lg font-medium">系統載入中...</p>
        <p className="text-sm">正在從資料庫同步最新排班資訊</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-red-50 px-6 text-center">
        <AlertTriangle size={48} className="text-red-600 mb-4" />
        <h1 className="text-xl font-bold text-red-900 mb-2">無法載入登入資料</h1>
        <p className="text-sm text-red-700 max-w-xl mb-6">{authError}</p>
        <button
          type="button"
          className="rounded-lg bg-red-700 px-4 py-2 text-white hover:bg-red-800"
          onClick={() => window.location.reload()}
        >
          重新載入
        </button>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // FORCE PASSWORD CHANGE CHECK
  if (
    currentUser.mustChangePassword ||
    !isPasswordMigrationReadyForRole(currentUser.password, currentUser.role)
  ) {
    return (
      <ChangePasswordPage
        currentUser={currentUser}
        onPasswordChanged={handleLogin}
        onLogout={handleLogout}
      />
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage currentUser={currentUser} />;
      case "statistics":
        return <StatisticsPage currentUser={currentUser} />;
      case "leave":
        return <LeavePage currentUser={currentUser} />;
      case "staff":
        return <StaffPage currentUser={currentUser} />;
      case "settings":
        return <SettingsPage currentUser={currentUser} />;
      case "doctors":
        return <DoctorManagerPage currentUser={currentUser} />;
      case "doctor_statistics":
        return <DoctorStatisticsPage currentUser={currentUser} />;
      case "physician_settings":
        return <PhysicianSettingsPage currentUser={currentUser} />;
      case "physician_schedule":
        return <PhysicianSchedulePage currentUser={currentUser} />;
      case "cloud_schedule":
        return <CloudSchedulePage currentUser={currentUser} />;
      case "health_mgmt":
        return <HealthMgmtPage currentUser={currentUser} />;
      case "administrative_schedule":
        return (
          <AdministrativeSchedulePage
            currentUser={currentUser}
            categories={[
              AdministrativeCategory.CUSTOMER_SERVICE,
              AdministrativeCategory.GENERAL_AFFAIRS,
              AdministrativeCategory.IT,
              AdministrativeCategory.REPORTING,
              AdministrativeCategory.ADMIN,
            ]}
            title="行政排班管理"
          />
        );
      case "gene_schedule":
        return (
          <AdministrativeSchedulePage
            currentUser={currentUser}
            categories={[AdministrativeCategory.GENE, AdministrativeCategory.GENE_H]}
            title="基因排班管理"
          />
        );
      case "meeting_room":
        return <MeetingRoomPage currentUser={currentUser} />;
      case "gene":
        return <GenePage currentUser={currentUser} />;
      case "skill_dashboard":
        return <SkillDashboardPage currentUser={currentUser} />;
      default:
        return <DashboardPage currentUser={currentUser} />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
        {/* Top Navigation */}
        <Sidebar
          currentUser={currentUser}
          onNavigate={setCurrentPage}
          currentPage={currentPage}
          onLogout={handleLogout}
          hasPendingLeaves={hasPendingLeaves}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative">
          <Suspense
            fallback={
              <div className="h-full w-full flex items-center justify-center bg-gray-50 text-gray-500">
                <Loader2 size={36} className="animate-spin text-teal-600" />
              </div>
            }
          >
            {renderPage()}
          </Suspense>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
