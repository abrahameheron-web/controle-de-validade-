import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = { setupRequired: boolean };

export default function AuthScreen({ setupRequired }: Props) {
  const utils = trpc.useUtils();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localError, setLocalError] = useState("");

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => utils.auth.current.invalidate(),
  });
  const setup = trpc.auth.setup.useMutation({
    onSuccess: async () => utils.auth.current.invalidate(),
  });

  const busy = login.isPending || setup.isPending;
  const error = localError || login.error?.message || setup.error?.message;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    try {
      if (setupRequired) {
        if (password !== confirmation) {
          setLocalError("As senhas não conferem.");
          return;
        }
        await setup.mutateAsync({ displayName, username, password });
        return;
      }
      await login.mutateAsync({ username, password });
    } catch {
      // The tRPC mutation exposes a localized error in the form below.
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src="/icon.svg" alt="" />
        <p className="eyebrow">Made by Heron</p>
        <h1>{setupRequired ? "Comece por aqui" : "Controle de Validade"}</h1>
        <p className="auth-intro">
          {setupRequired
            ? "Crie a conta do administrador antes de compartilhar o link. Depois, ele poderá cadastrar os funcionários."
            : "Entre com seu usuário e senha para acompanhar os produtos."}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {setupRequired && (
            <label className="field">
              <span>Nome do administrador</span>
              <input
                autoComplete="name"
                maxLength={120}
                onChange={event => setDisplayName(event.target.value)}
                placeholder="Como devemos chamar você?"
                required
                value={displayName}
              />
            </label>
          )}
          <label className="field">
            <span>Usuário</span>
            <input
              autoCapitalize="none"
              autoComplete="username"
              maxLength={48}
              onChange={event => setUsername(event.target.value)}
              placeholder="Seu usuário"
              required
              value={username}
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              autoComplete={setupRequired ? "new-password" : "current-password"}
              onChange={event => setPassword(event.target.value)}
              placeholder="Sua senha"
              required
              type="password"
              value={password}
            />
            {setupRequired && <small>Mínimo de 10 caracteres.</small>}
          </label>
          {setupRequired && (
            <label className="field">
              <span>Confirmar senha</span>
              <input
                autoComplete="new-password"
                onChange={event => setConfirmation(event.target.value)}
                placeholder="Digite a senha novamente"
                required
                type="password"
                value={confirmation}
              />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={18} /> : setupRequired ? <ShieldCheck size={18} /> : <ArrowRight size={18} />}
            {busy ? "Aguarde…" : setupRequired ? "Criar administrador" : "Entrar"}
          </button>
        </form>

        <div className="auth-security">
          {setupRequired ? <KeyRound size={15} /> : <ShieldCheck size={15} />}
          <span>Seu acesso é individual. As senhas são protegidas no servidor.</span>
        </div>
      </div>
      <footer className="auth-footer">Controle simples. Estoque em dia.</footer>
    </main>
  );
}
