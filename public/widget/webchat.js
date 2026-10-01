/**
 * DeskcommCRM - Webchat Embed Widget Script
 * Injeta o botão flutuante e o iframe de atendimento no site do cliente.
 */
(function () {
  if (window.__deskcomm_webchat_loaded) return;
  window.__deskcomm_webchat_loaded = true;

  // Localiza a tag do script atual para extrair os atributos de configuração
  var currentScript =
    document.currentScript ||
    document.querySelector("script[src*='/widget/webchat.js']");

  var webchatId = currentScript ? currentScript.getAttribute("data-webchat-id") : "";
  var brandColor = currentScript ? (currentScript.getAttribute("data-color") || "#0ea5e9") : "#0ea5e9";
  var position = currentScript ? (currentScript.getAttribute("data-position") || "bottom_right") : "bottom_right";

  if (!webchatId) {
    console.warn("[Deskcomm Webchat] data-webchat-id não fornecido no script.");
    return;
  }

  // Descobre a URL base do servidor Deskcomm
  var scriptUrl = new URL(currentScript.src);
  var baseUrl = scriptUrl.origin;
  var chatPageUrl = baseUrl + "/webchat/" + encodeURIComponent(webchatId);

  // Injeta estilos CSS isolados
  var style = document.createElement("style");
  style.id = "deskcomm-webchat-styles";
  style.textContent = `
    .deskcomm-chat-launcher {
      position: fixed;
      bottom: 24px;
      ${position === "bottom_left" ? "left: 24px;" : "right: 24px;"}
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: ${brandColor};
      color: #ffffff;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483640;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
      border: none;
      outline: none;
    }
    .deskcomm-chat-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.28);
    }
    .deskcomm-chat-launcher svg {
      width: 28px;
      height: 28px;
      fill: currentColor;
      transition: transform 0.2s ease;
    }
    .deskcomm-chat-container {
      position: fixed;
      bottom: 96px;
      ${position === "bottom_left" ? "left: 24px;" : "right: 24px;"}
      width: 380px;
      height: 600px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 120px);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
      z-index: 2147483645;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.08);
      opacity: 0;
      pointer-events: none;
      transform: translateY(20px) scale(0.96);
      transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .deskcomm-chat-container.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }
    .deskcomm-chat-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    @media (max-width: 480px) {
      .deskcomm-chat-container {
        bottom: 0;
        right: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        border-radius: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Cria o iframe do chat
  var container = document.createElement("div");
  container.className = "deskcomm-chat-container";

  var iframe = document.createElement("iframe");
  iframe.className = "deskcomm-chat-iframe";
  iframe.src = chatPageUrl;
  iframe.allow = "microphone; camera";
  iframe.title = "Atendimento Deskcomm";
  container.appendChild(iframe);
  document.body.appendChild(container);

  // Cria o botão launcher
  var launcher = document.createElement("button");
  launcher.className = "deskcomm-chat-launcher";
  launcher.setAttribute("aria-label", "Abrir chat de atendimento");
  
  var chatIcon = '<svg viewBox="0 0 256 256"><path d="M216,48H40A16,16,0,0,0,24,64V224a8,8,0,0,0,13.66,5.66L72,195.31V208a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM88,208V192a8,8,0,0,0-8-8H40V64H216V208Z"></path></svg>';
  var closeIcon = '<svg viewBox="0 0 256 256"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path></svg>';

  launcher.innerHTML = chatIcon;
  var isOpen = false;

  launcher.addEventListener("click", function () {
    isOpen = !isOpen;
    if (isOpen) {
      container.classList.add("open");
      launcher.innerHTML = closeIcon;
    } else {
      container.classList.remove("open");
      launcher.innerHTML = chatIcon;
    }
  });

  document.body.appendChild(launcher);
})();
