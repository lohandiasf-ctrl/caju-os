// Política de privacidade pública (sem login): exigida pela Meta para publicar
// o app do WhatsApp da distribuição de chamados (docs/DISPATCH_WHATSAPP.md).
// Rota liberada em lib/permissions.ts (PUBLIC_PATHS). Texto a revisar pela
// empresa sempre que o uso dos dados mudar.

export const metadata = { title: 'Política de Privacidade · Caju OS' };

const UPDATED = '28 de setembro de 2026';

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <article className="mx-auto max-w-2xl px-5 py-12 text-[15px] leading-relaxed sm:py-16">
        <p className="page-eyebrow">Caju OS</p>
        <h1 className="page-title">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Atualizada em {UPDATED}.</p>

        <Section title="Quem somos">
          <p>
            A Caju Tech (J D DE OLIVEIRA SILVA INFORMATICA) presta serviços de assistência técnica em campo. O Caju OS é o
            sistema interno em que a equipe organiza os chamados, e o número de WhatsApp de distribuição é usado para
            oferecer atendimentos aos técnicos parceiros. Contato sobre privacidade: <a className="text-primary underline" href="mailto:corporativo@cajutech.net">corporativo@cajutech.net</a>.
          </p>
        </Section>

        <Section title="Quais dados usamos">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Técnicos parceiros:</b> nome, CPF, telefone de WhatsApp e cidades em que atendem, informados no cadastro.</li>
            <li><b>Interações pelo WhatsApp:</b> o aceite de um atendimento, as mensagens trocadas com o número de distribuição e o status de entrega (enviada, entregue, lida).</li>
            <li><b>Equipe interna:</b> nome, e-mail e telefone de quem usa o Caju OS.</li>
          </ul>
        </Section>

        <Section title="Para que usamos">
          <ul className="list-disc space-y-1 pl-5">
            <li>Oferecer atendimentos técnicos aos parceiros da cidade e confirmar quem aceitou.</li>
            <li>Registrar o técnico designado no chamado, inclusive no sistema de chamados do cliente atendido.</li>
            <li>Avisar a equipe interna sobre o andamento da distribuição.</li>
          </ul>
          <p className="mt-2">Não usamos esses dados para publicidade e não vendemos dados pessoais.</p>
        </Section>

        <Section title="Com quem compartilhamos">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Meta (WhatsApp Business Platform):</b> para entregar as mensagens.</li>
            <li><b>Cliente atendido:</b> nome e CPF do técnico designado, no sistema de chamados do cliente, para liberar o atendimento.</li>
            <li><b>Provedores de infraestrutura</b> (hospedagem, banco de dados e autenticação), só para operar o sistema.</li>
          </ul>
        </Section>

        <Section title="Por quanto tempo guardamos">
          <p>Enquanto o cadastro estiver ativo e, depois disso, pelo prazo necessário para cumprir obrigações legais e contratuais dos atendimentos realizados.</p>
        </Section>

        <Section id="exclusao" title="Seus direitos e exclusão de dados">
          <p>
            Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir acesso, correção ou exclusão dos seus dados, e pedir para não
            receber mais ofertas pelo WhatsApp. Basta escrever para <a className="text-primary underline" href="mailto:corporativo@cajutech.net">corporativo@cajutech.net</a> ou
            falar com a coordenação da Caju Tech. Respondemos em até 15 dias.
          </p>
        </Section>

        <Section title="Segurança">
          <p>O acesso ao Caju OS é restrito por perfil, com login individual, e as comunicações são criptografadas.</p>
        </Section>
      </article>
    </main>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-8">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <div className="mt-2 text-muted-foreground [&_b]:text-foreground">{children}</div>
    </section>
  );
}
