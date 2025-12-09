// src/utils/sendEmail.js

// Por enquanto, só loga no console.
// Depois podemos plugar SendGrid, Resend, SES, etc.
export async function sendEmail({ to, subject, html }) {
  console.log("📧 [FAKE EMAIL] Enviando e-mail para:");
  console.log("Para:", to);
  console.log("Assunto:", subject);
  console.log("HTML:", html);
}
