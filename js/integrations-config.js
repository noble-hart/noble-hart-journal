// PUBLIC configuration only. Never put secret keys, SMTP passwords, service-role keys, or
// Cloudflare Turnstile SECRET keys in this file.
export const INTEGRATIONS = {
  emailjs: {
    publicKey: '',       // EmailJS Account > Public Key
    serviceId: '',       // EmailJS Email Services
    templateId: '',      // EmailJS template with reCAPTCHA v2 ENABLED
    recaptchaSiteKey: '' // Google reCAPTCHA v2 checkbox PUBLIC site key
  },
  brevoSignupUrl: 'https://fcf1c012.sibforms.com/serve/MUIFAEbkqqenBSq-Y-HGUKX3fKbjnwRC27VrEtPPg1ZJx5kiUvAvsLzdDQzzwpuluqY2pNFVVakmlqEboB2P06UNe78urt2C8SvdM0MnSV79GUdUOW6Tk93a9hvlL-N1UrfauYn-LdW6Gl_u9QxHT-WhoC1LFLOGExNUdAEuHDyRnrlhdP6rjKQs8VPjQkaZBpr304nGuFGplCnB0w=='     // HTTPS URL to your Brevo double-opt-in hosted signup form
};
