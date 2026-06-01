import { ShieldCheck } from 'lucide-react';
import { AdminWorkspace } from './components/AdminWorkspace';
import { CounselorWorkspace } from './components/CounselorWorkspace';
import { LoginPage } from './components/LoginPage';
import { useDemoApp } from './state/DemoAppContext';

export function App() {
  const { activeProfile, connected, logout } = useDemoApp();

  if (!activeProfile) return <LoginPage />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-shield">
            <ShieldCheck size={23} aria-hidden="true" />
          </span>
          <div>
            <strong>이음로그</strong>
            <span>학교폭력 상담 전처리 플랫폼</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="synthetic-pill">{connected ? 'Supabase 연결 모드' : '합성 데이터 데모'}</span>
          <span className="profile-pill">{activeProfile.displayName}</span>
          <button className="button ghost" onClick={logout} type="button">
            로그아웃
          </button>
        </div>
      </header>
      {activeProfile.role === 'counselor' ? <CounselorWorkspace /> : <AdminWorkspace />}
    </main>
  );
}
