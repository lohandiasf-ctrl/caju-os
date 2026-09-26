export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  
  if (!id) {
    return Response.redirect(new URL("/", request.url), 302);
  }

  const webUrl = new URL(`/?view=technicians&tech=${id}`, request.url).toString();
  const appUrl = `cajuos://tech/${id}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecionando...</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f9fafb; color: #111827; }
    .loader { border: 3px solid #e5e7eb; border-top-color: #208AEF; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin-bottom: 16px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader"></div>
  <p>Abrindo o perfil do técnico...</p>
  <script>
    // Tenta abrir o aplicativo mobile
    window.location.replace("${appUrl}");
    
    // Fallback para o sistema web caso o app não responda
    setTimeout(function() {
      window.location.replace("${webUrl}");
    }, 1500);
  </script>
</body>
</html>
  `;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
