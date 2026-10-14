import { LoaderCircle, RotateCw } from "lucide-react";
import AuthScreen from "@/components/AuthScreen";
import ExpiryWorkspace from "@/components/ExpiryWorkspace";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const session = trpc.auth.current.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: true,
  });

  if (session.isLoading) {
    return <main className="loading-screen"><LoaderCircle className="spin" size={24} /><span>Carregando seu acesso…</span></main>;
  }

  if (session.isError || !session.data) {
    return (
      <main className="loading-screen">
        <div className="connection-card">
          <h1>Não foi possível abrir o app</h1>
          <p>Verifique a conexão e tente novamente. Os dados ficam em um banco compartilhado e seguro.</p>
          <button className="button button-primary" onClick={() => void session.refetch()} type="button"><RotateCw size={16} /> Tentar novamente</button>
        </div>
      </main>
    );
  }

  if (!session.data.employee) {
    return <AuthScreen setupRequired={session.data.setupRequired} />;
  }

  return <ExpiryWorkspace employee={session.data.employee} />;
}
