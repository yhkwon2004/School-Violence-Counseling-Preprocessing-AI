import { ArrowRight, Building2, HeartHandshake, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useDemoApp } from '../state/DemoAppContext';

const roleCopy = {
  counselor: { label: '상담자', description: '관계도와 타임라인을 검토합니다.', icon: HeartHandshake },
  institution_admin: { label: '기관 관리자', description: '사용자와 사건 배정을 관리합니다.', icon: Building2 },
  platform_admin: { label: '플랫폼 관리자', description: '기관 운영 상태를 관리합니다.', icon: ShieldCheck },
} as const;

export function LoginPage() {
  const { bootstrapping, connected, dataset, loginAs, loginWithEmail } = useDemoApp();
  const [email, setEmail] = useState('counselor@wee.demo');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const staff = dataset.profiles.filter((profile) => profile.role !== 'student');

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await loginWithEmail(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '로그인할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-story">
        <div className="brand-lockup login-brand">
          <span className="brand-shield">
            <ShieldCheck size={27} aria-hidden="true" />
          </span>
          <div>
            <strong>이음로그</strong>
            <span>FACTLINE</span>
          </div>
        </div>
        <p className="eyebrow">상담 전 기록 정리</p>
        <h1>흩어진 경험을<br />상담 가능한 기록으로.</h1>
        <p className="login-description">
          AI가 판단하지 않습니다. 학생이 제공한 사실과 증거를 연결하고,
          상담자가 더 정확하게 듣도록 돕습니다.
        </p>
        <div className="trust-line">
          <span>비판단</span>
          <span>최소수집</span>
          <span>사람검토</span>
        </div>
      </section>
      <section className="login-panel" aria-label={connected ? '직원 로그인' : '데모 로그인'}>
        {connected ? (
          <>
            <p className="eyebrow">Secure staff access</p>
            <h2>직원 계정으로 로그인하세요</h2>
            <p>기관 이메일과 비밀번호를 확인한 뒤 RLS 범위 안의 기록만 불러옵니다.</p>
            <form className="staff-login-form" onSubmit={(event) => void submitLogin(event)}>
              <label>이메일<input autoComplete="username" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
              <label>비밀번호<input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
              {error && <span className="form-error">{error}</span>}
              <button className="button primary" disabled={busy || bootstrapping} type="submit">
                {busy || bootstrapping ? '확인 중...' : '로그인'} <ArrowRight size={16} />
              </button>
            </form>
            <p className="login-footnote">개발 seed 상담자 계정: counselor@wee.demo</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Synthetic demo access</p>
            <h2>역할을 선택해 확인하세요</h2>
            <p>클라우드 연결 전 합성 데이터로 실제 화면 흐름을 검증합니다.</p>
            <div className="role-list">
              {staff.map((profile) => {
                const copy = roleCopy[profile.role as keyof typeof roleCopy];
                const Icon = copy.icon;
                return (
                  <button className="role-card" key={profile.id} onClick={() => loginAs(profile.id)} type="button">
                    <Icon size={22} aria-hidden="true" />
                    <span>
                      <strong>{copy.label}</strong>
                      <small>{copy.description}</small>
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <p className="login-footnote">환경변수를 등록하면 직원 이메일 로그인과 RLS 권한 검증을 사용합니다.</p>
          </>
        )}
      </section>
    </main>
  );
}
