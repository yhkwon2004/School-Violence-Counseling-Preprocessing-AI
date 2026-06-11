import { LogOut, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { AdminWorkspace } from './components/AdminWorkspace';
import { CounselorWorkspace } from './components/CounselorWorkspace';
import { LoginPage } from './components/LoginPage';
import { DemoAppProvider, useDemoApp } from './state/DemoAppContext';
import { StudentWebApp } from './student/StudentWebApp';

export function App() {
  if (window.location.pathname.startsWith('/student')) {
    return <StudentWebApp />;
  }

  return (
    <DemoAppProvider>
      <StaffApp />
    </DemoAppProvider>
  );
}

function StaffApp() {
  const { activeProfile, bootstrapping, connected, logout } = useDemoApp();

  if (bootstrapping && !activeProfile) {
    return (
      <main className="app-loading" aria-live="polite">
        <img alt="" src="/ieumlog-icon.png" />
        <strong>이음로그를 불러오는 중입니다</strong>
        <span>기관 권한과 사건철 데이터를 확인하고 있어요.</span>
      </main>
    );
  }

  if (!activeProfile) {
    return <LoginPage />;
  }

  return (
    <main className="staff-shell">
      <header className="staff-commandbar">
        <div className="staff-identity">
          <img alt="" src="/ieumlog-icon.png" />
          <div>
            <span className="eyebrow">Ieumlog casefile</span>
            <strong>{activeProfile.displayName}</strong>
          </div>
        </div>
        <div className="staff-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{connected ? 'Supabase 연결 모드' : '합성 데이터 시연 모드'}</span>
        </div>
        <div className="staff-commandbar-actions">
          <button className="button secondary" onClick={() => { window.location.href = '/student'; }} type="button">
            <MonitorSmartphone size={16} aria-hidden="true" />
            학생 화면
          </button>
          <button className="button ghost" onClick={logout} type="button">
            <LogOut size={16} aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </header>

      {activeProfile.role === 'counselor' ? <CounselorWorkspace /> : <AdminWorkspace />}
    </main>
  );
}
