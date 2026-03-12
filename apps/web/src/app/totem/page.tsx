"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/image-utils";
import jsQR from "jsqr";
import {
  Package, QrCode, Camera, CheckCircle, XCircle,
  Keyboard, Loader2, UserCheck, RotateCcw, Users, Shield, Settings,
  Lock, Smartphone, Monitor, Save,
} from "lucide-react";

type Step =
  | "scan" | "manual" | "found"
  | "camera-face" | "camera-package"
  | "select-resident"
  | "confirm" | "success" | "error";

interface DeliveryData {
  id: string;
  code: string;
  status: string;
  user: { id: string; name: string; phone: string; photoUrl?: string };
  unit: { number: string; block?: string; type: string };
  location: { code: string; description?: string };
  createdAt: string;
}

interface Resident {
  id: string;
  name: string;
  photoUrl?: string;
}

interface TotemTenant {
  id: string;
  name: string;
}

type TotemMode = "monitor" | "tablet";

const STORAGE_KEYS = {
  tenantId: "totem.selectedTenantId",
  camera: "totem.cameraSelection",
  mirror: "totem.cameraMirror",
  password: "totem.settingsPassword",
};

function TotemScreen({ forcedMode }: { forcedMode?: TotemMode }) {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-slate-900"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>}>
      <TotemContent forcedMode={forcedMode} />
    </Suspense>
  );
}

export default function TotemPage() {
  return <TotemScreen />;
}

// Componente de câmera com refresh automático (snapshot RTSP via proxy)
function CameraFeed({ url }: { url: string }) {
  const [imgSrc, setImgSrc] = useState(`${url}?t=${Date.now()}`);
  const [hasError, setHasError] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Recarregar snapshot a cada 2 segundos
    intervalRef.current = setInterval(() => {
      setImgSrc(`${url}?t=${Date.now()}`);
    }, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [url]);

  return (
    <>
      <div className="h-4 w-px bg-slate-700" />
      <div className="w-full rounded-xl border border-slate-700 bg-slate-800/60 p-3">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Shield className="h-4 w-4 text-red-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
            Ambiente Monitorado
          </span>
        </div>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          {!hasError ? (
            <img
              src={imgSrc}
              alt="Câmera de monitoramento"
              className="h-full w-full object-cover"
              onError={() => setHasError(true)}
              onLoad={() => setHasError(false)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              <Camera className="h-8 w-8" />
            </div>
          )}
          <div className="absolute left-2 top-2 flex items-center gap-1">
            <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-[10px] font-medium text-red-400">REC</span>
          </div>
        </div>
      </div>
    </>
  );
}

function TotemContent({ forcedMode }: { forcedMode?: TotemMode }) {
  const searchParams = useSearchParams();
  const queryTenantId = searchParams.get("tenant") || "";
  const modeParam = searchParams.get("mode");
  const mode: TotemMode = forcedMode || (modeParam === "tablet" ? "tablet" : "monitor");
  const isTabletMode = mode === "tablet";
  const [step, setStep] = useState<Step>("scan");
  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [capturedFacePhoto, setCapturedFacePhoto] = useState<string | null>(null);
  const [capturedFaceBlob, setCapturedFaceBlob] = useState<Blob | null>(null);
  const [capturedPackagePhoto, setCapturedPackagePhoto] = useState<string | null>(null);
  const [capturedPackageBlob, setCapturedPackageBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>("");
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [rtspCameraUrl, setRtspCameraUrl] = useState<string | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [pendingDeviceId, setPendingDeviceId] = useState<string>("");
  const [isMirrored, setIsMirrored] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [activeTenantId, setActiveTenantId] = useState("");
  const [pendingTenantId, setPendingTenantId] = useState("");
  const [tenants, setTenants] = useState<TotemTenant[]>([]);
  const [settingsPasswordInput, setSettingsPasswordInput] = useState("");
  const [settingsPasswordError, setSettingsPasswordError] = useState("");
  const [showSettingsAuth, setShowSettingsAuth] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<any>(null);
  const scanningRef = useRef<boolean>(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  // Inactivity timer - back to scan after 60s (only from non-scan steps)
  const inactivityRef = useRef<NodeJS.Timeout | null>(null);
  const stepRef = useRef<Step>("scan");
  // Keep stepRef in sync
  useEffect(() => { stepRef.current = step; }, [step]);

  const currentTenantName = tenants.find((tenant) => tenant.id === activeTenantId)?.name || "";

  const getSavedPassword = useCallback(() => {
    if (typeof window === "undefined") return "1234";
    return localStorage.getItem(STORAGE_KEYS.password) || "1234";
  }, []);

  const getPreferredCameraChoice = useCallback(() => {
    if (selectedDeviceId) return selectedDeviceId;
    return isTabletMode ? "user" : "environment";
  }, [isTabletMode, selectedDeviceId]);

  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      // Se já está na tela de scan, não faz nada (câmera fica ligada sempre)
      if (stepRef.current === "scan") return;
      stopCamera();
      resetState();
      setStep("scan");
    }, 60000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTenantId = localStorage.getItem(STORAGE_KEYS.tenantId) || "";
    const savedCamera = localStorage.getItem(STORAGE_KEYS.camera) || "";
    const savedMirror = localStorage.getItem(STORAGE_KEYS.mirror);
    if (!localStorage.getItem(STORAGE_KEYS.password)) {
      localStorage.setItem(STORAGE_KEYS.password, "1234");
    }

    const initialTenantId = queryTenantId || savedTenantId;
    setActiveTenantId(initialTenantId);
    setPendingTenantId(initialTenantId);
    if (savedCamera) setSelectedDeviceId(savedCamera);
    setIsMirrored(savedMirror !== null ? savedMirror === "true" : isTabletMode);
    setConfigReady(true);

    api.totemGetTenants().then(setTenants).catch(() => {});

    // Register Service Worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/totem" }).catch(() => {});
    }

    const requestWakeLock = async () => {
      try {
        if ((navigator as any).wakeLock?.request) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {}
    };

    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release?.().catch?.(() => {});
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      stopQrScanning();
      stopCamera();
    };
  }, [isTabletMode, queryTenantId]);

  useEffect(() => {
    if (!configReady) return;
    enumerateDevices();
    if (step === "scan") {
      startCameraWithRetry(getPreferredCameraChoice()).then(() => startQrScanning());
    }
  }, [configReady]);

  async function enumerateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.warn("API de dispositivos não disponível.");
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoIn = devices.filter(d => d.kind === "videoinput");
      setVideoDevices(videoIn);

      // Se tivermos dispositivos mas sem label, precisamos de permissão primeiro
      if (videoIn.length > 0 && !videoIn[0].label) {
        console.log("Câmeras detectadas sem nome. Aguardando permissão...");
      }
    } catch (err) {
      console.error("Erro ao listar câmeras:", err);
    }
  }

  useEffect(() => {
    if (activeTenantId) {
      api.totemGetRtspConfig(activeTenantId).then((data: any) => {
        if (data?.rtspCameraUrl) {
          setRtspCameraUrl(`/totem-api/config/${encodeURIComponent(activeTenantId)}/rtsp-proxy`);
        } else {
          setRtspCameraUrl(null);
        }
      }).catch(() => { });
    } else {
      setRtspCameraUrl(null);
    }
  }, [activeTenantId]);

  // Manage camera based on step changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== "scan") {
      resetInactivity();
      stopQrScanning();
    } else {
      // Na tela scan: liga câmera e scanning, sem timer de inatividade
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      if (configReady) {
        startCameraWithRetry(getPreferredCameraChoice()).then(() => startQrScanning());
      }
      setShowManualInput(false);
      // Não fecha as configurações aqui — só fecha via ação explícita do usuário
    }
  // Depende apenas de step e configReady. getPreferredCameraChoice é intencional via ref.
  }, [step, configReady]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetState() {
    setDelivery(null);
    setManualCode("");
    setCapturedFacePhoto(null);
    setCapturedFaceBlob(null);
    setCapturedPackagePhoto(null);
    setCapturedPackageBlob(null);
    setError("");
    setShowManualInput(false);
    setResidents([]);
    setSelectedResident(null);
  }

  // =================== CAMERA ===================
  async function startCamera(facingMode: "environment" | "user" | string = "environment") {
    try {
      stopCamera();
      setSelectedDeviceId(facingMode);

      const constraints: MediaStreamConstraints = {
        video: typeof facingMode === "string" && facingMode !== "environment" && facingMode !== "user"
          ? { deviceId: { exact: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Aguarda o vídeo estar realmente pronto para reproduzir (importante no Android)
        await new Promise<void>((resolve, reject) => {
          const video = videoRef.current!;
          const onCanPlay = () => {
            video.removeEventListener("canplay", onCanPlay);
            resolve();
          };
          video.addEventListener("canplay", onCanPlay);
          video.play().catch(reject);
          // Timeout de segurança: resolve após 3s mesmo se canplay não disparar
          setTimeout(() => {
            video.removeEventListener("canplay", onCanPlay);
            resolve();
          }, 3000);
        });

        // Atualiza o ID da câmera selecionada se for automático
        const track = stream.getVideoTracks()[0];
        if (track) {
          setSelectedDeviceId(track.getSettings().deviceId || facingMode);
        }
      }
    } catch (err: any) {
      console.error("Erro ao acessar câmera:", err);
      if (err.name === "NotAllowedError") {
        setError("Permissão de câmera negada. Por favor, autorize o acesso no navegador.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("Nenhuma câmera encontrada. Verifique se ela está conectada.");
      } else if (!window.isSecureContext) {
        setError("A câmera só funciona em conexões SEGURAS (HTTPS). Use um domínio com SSL ou localhost.");
      } else {
        setError(`Erro ao acessar câmera: ${err.message}`);
      }
    } finally {
      // Tenta atualizar a lista de câmeras agora que possivelmente temos permissão
      enumerateDevices();
    }
  }

  // Tenta iniciar a câmera com retry (útil para Android que pode demorar)
  async function startCameraWithRetry(facingMode: "environment" | "user" | string = "environment", retries = 2) {
    for (let i = 0; i <= retries; i++) {
      await startCamera(facingMode);
      // Verifica se o stream está ativo
      if (streamRef.current && streamRef.current.active) return;
      // Espera um pouco antes de tentar novamente
      if (i < retries) await new Promise(r => setTimeout(r, 500));
    }
  }

  function stopCamera() {
    stopQrScanning();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  // =================== QR SCANNING ===================
  function startQrScanning() {
    if (scanIntervalRef.current) return;
    scanningRef.current = true;
    setScanStatus("Procurando QR Code...");

    scanIntervalRef.current = setInterval(() => {
      if (!scanningRef.current) return;
      const video = videoRef.current;
      // readyState >= 2 = HAVE_CURRENT_DATA, verifica se o vídeo tem dados
      if (!video || video.readyState < 2 || video.paused) {
        // Se o vídeo pausou (Android pode pausar em background), tenta dar play
        if (video && video.paused && video.srcObject) {
          video.play().catch(() => { });
        }
        return;
      }

      if (!scanCanvasRef.current) {
        scanCanvasRef.current = document.createElement("canvas");
      }
      const canvas = scanCanvasRef.current!;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) return;

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const qrResult = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });

      if (qrResult && qrResult.data) {
        const code = qrResult.data.trim();
        const now = Date.now();

        if (code === lastScannedRef.current && now - lastScannedTimeRef.current < 5000) {
          return;
        }

        lastScannedRef.current = code;
        lastScannedTimeRef.current = now;
        setScanStatus(`QR lido: ${code}`);
        stopQrScanning();
        searchDelivery(code);
      }
    }, 300);
  }

  function stopQrScanning() {
    scanningRef.current = false;
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setScanStatus("");
  }

  function captureFrame(): { dataUrl: string; blob: Blob } | null {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    const byteString = atob(dataUrl.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: "image/jpeg" });

    return { dataUrl, blob };
  }

  // =================== FLOW ===================
  async function searchDelivery(code: string) {
    if (!code.trim()) return;
    if (!activeTenantId) {
      setError("Selecione um condomínio nas configurações do totem.");
      setStep("error");
      return;
    }
    setLoading(true);
    setError("");
    resetInactivity();
    try {
      const result = await api.totemFindByCode(code.trim(), activeTenantId);
      if (result.status === "WITHDRAWN") {
        setError("Esta encomenda já foi retirada.");
        setStep("error");
      } else {
        stopCamera();
        setDelivery(result);
        setStep("found");
      }
    } catch (err: any) {
      setError(err.message || "Encomenda não encontrada");
      setStep("error");
    }
    setLoading(false);
  }

  // Sim, sou eu → captura foto do rosto
  async function startFaceCapture(resident?: Resident) {
    if (resident) setSelectedResident(resident);
    setStep("camera-face");
    resetInactivity();
    await startCamera("user");
  }

  function takeFacePhoto() {
    const result = captureFrame();
    if (result) {
      setCapturedFacePhoto(result.dataUrl);
      setCapturedFaceBlob(result.blob);
      stopCamera();
      // Ir para captura de foto com a encomenda
      startPackageCapture();
    }
    resetInactivity();
  }

  // Captura da foto segurando a encomenda (câmera traseira ou frontal)
  async function startPackageCapture() {
    setStep("camera-package");
    resetInactivity();
    await startCamera(isTabletMode ? getPreferredCameraChoice() : "environment");
  }

  function takePackagePhoto() {
    const result = captureFrame();
    if (result) {
      setCapturedPackagePhoto(result.dataUrl);
      setCapturedPackageBlob(result.blob);
      stopCamera();
      setStep("confirm");
    }
    resetInactivity();
  }

  // Não sou eu → listar moradores
  async function handleNotMe() {
    if (!delivery) return;
    setLoading(true);
    resetInactivity();
    try {
      const result = await api.totemGetResidents(delivery.code, activeTenantId);
      // Filtra o dono da encomenda da lista
      const others = (result as Resident[]).filter((r) => r.id !== delivery.user.id);
      if (others.length === 0) {
        setError("Não há outros moradores cadastrados nesta unidade. Apenas o destinatário pode retirar.");
        setStep("error");
      } else {
        setResidents(others);
        setStep("select-resident");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao buscar moradores");
      setStep("error");
    }
    setLoading(false);
  }

  async function confirmWithdraw() {
    if (!delivery) return;
    setLoading(true);
    resetInactivity();
    try {
      const photos: File[] = [];
      if (capturedFaceBlob) {
        let file = new File([capturedFaceBlob], "face.jpg", { type: "image/jpeg" });
        file = await compressImage(file, 190);
        photos.push(file);
      }
      if (capturedPackageBlob) {
        let file = new File([capturedPackageBlob], "package.jpg", { type: "image/jpeg" });
        file = await compressImage(file, 190);
        photos.push(file);
      }
      const withdrawnById = selectedResident?.id;
      await api.totemWithdraw(delivery.code, photos, withdrawnById, activeTenantId);
      setStep("success");
    } catch (err: any) {
      setError(err.message || "Erro ao confirmar retirada");
      setStep("error");
    }
    setLoading(false);
  }

  function goToScan() {
    stopCamera();
    resetState();
    lastScannedRef.current = "";
    lastScannedTimeRef.current = 0;
    setStep("scan");
  }

  function openSettings() {
    setSettingsPasswordError("");
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    setShowSettingsAuth(true);
  }

  function unlockSettings() {
    if (settingsPasswordInput !== getSavedPassword()) {
      setSettingsPasswordError("Senha inválida");
      return;
    }
    setShowSettingsAuth(false);
    setSettingsPasswordInput("");
    setPendingDeviceId(selectedDeviceId);
    setShowSettings(true);
  }

  function saveTotemSettings() {
    if (!pendingTenantId) return;
    const deviceToSave = pendingDeviceId || selectedDeviceId || getPreferredCameraChoice();
    localStorage.setItem(STORAGE_KEYS.tenantId, pendingTenantId);
    localStorage.setItem(STORAGE_KEYS.camera, deviceToSave);
    localStorage.setItem(STORAGE_KEYS.mirror, String(isMirrored));
    if (newPassword.trim()) {
      localStorage.setItem(STORAGE_KEYS.password, newPassword.trim());
      setNewPassword("");
    }
    setSelectedDeviceId(deviceToSave);
    setActiveTenantId(pendingTenantId);
    setShowSettings(false);
    // Reinicia câmera com a câmera selecionada
    stopCamera();
    setTimeout(() => {
      startCameraWithRetry(deviceToSave).then(() => startQrScanning());
    }, 200);
  }

  const withdrawerName = selectedResident?.name || delivery?.user.name || "";

  // =================== RENDER ===================
  return (
    <div className="h-screen w-screen overflow-hidden" onClick={resetInactivity}>
      <canvas ref={canvasRef} className="hidden" />

      {showSettingsAuth && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Lock className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-semibold">Acesso às configurações</h2>
            </div>
            <input
              type="password"
              value={settingsPasswordInput}
              onChange={(e) => setSettingsPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && unlockSettings()}
              placeholder="Digite a senha"
              className="w-full rounded-xl bg-slate-800 px-4 py-3 outline-none ring-1 ring-slate-700 focus:ring-blue-500"
            />
            {settingsPasswordError && <p className="mt-2 text-sm text-red-400">{settingsPasswordError}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowSettingsAuth(false)} className="flex-1 rounded-xl bg-slate-700 px-4 py-3 text-sm hover:bg-slate-600">Cancelar</button>
              <button onClick={unlockSettings} className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold hover:bg-blue-700">Entrar</button>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">Senha padrão para teste: 1234</p>
          </div>
        </div>
      )}

      {/* ===== SCAN: Tela principal - câmera 70% + painel lateral 30% ===== */}
      {step === "scan" && (
        <div className="flex h-full w-full">
          {/* Câmera - 70% da tela */}
          <div className="relative" style={{ width: "70%", height: "100%" }}>
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
              style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
            />

            {/* QR Frame overlay + Face Frame */}
            <div className="absolute inset-0 flex items-center justify-between px-[3%]">
              {/* Face frame - lado esquerdo (grande, circular) */}
              <div className="relative flex flex-col items-center ml-[3%] lg:ml-[5%]">
                <div className="relative h-[14rem] w-[14rem] md:h-[18rem] md:w-[18rem] lg:h-[22rem] lg:w-[22rem] xl:h-[28rem] xl:w-[28rem] rounded-full border-4 border-green-400 shadow-[0_0_40px_rgba(34,197,94,0.15)]">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <UserCheck className="h-16 w-16 text-green-400/20" />
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <p className="text-sm font-medium text-green-300 drop-shadow-lg">
                    Posicione o rosto aqui
                  </p>
                </div>
              </div>

              {/* QR Frame - lado direito */}
              <div className="relative">
                <div className="relative h-36 w-36 md:h-44 md:w-44 lg:h-56 lg:w-56 xl:h-72 xl:w-72 rounded-2xl border-4 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                  <div className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-blue-300" />
                  <div className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-blue-300" />
                  <div className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-blue-300" />
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-blue-300" />
                  <div
                    className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent"
                    style={{ animation: "scanLine 2s ease-in-out infinite" }}
                  />
                </div>
                <div className="mt-3 text-center">
                  <p className="text-sm font-medium text-blue-300 drop-shadow-lg">
                    {loading ? "Buscando encomenda..." : scanStatus || "Posicione o QR Code aqui"}
                  </p>
                  {loading && <Loader2 className="mx-auto mt-2 h-5 w-5 animate-spin text-blue-400" />}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/10" />
          </div>

          {/* Painel lateral - 30% */}
          <div className="flex flex-col items-center justify-between bg-slate-900 p-6" style={{ width: "30%", height: "100%" }}>
            <div className="flex flex-col items-center gap-4 pt-8">
              {!logoError ? (
                <img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain" onError={() => setLogoError(true)} />
              ) : (
                <div className="rounded-full bg-blue-600/20 p-4">
                  <Package className="h-12 w-12 text-blue-400" />
                </div>
              )}
              <h1 className="text-center text-2xl font-bold lg:text-3xl">
                Retirada de<br />Encomendas
              </h1>
              <p className="text-center text-sm text-slate-400 lg:text-base">
                {currentTenantName ? `${currentTenantName}` : "Selecione um condomínio nas configurações"}
              </p>
              <div className="flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-[11px] uppercase tracking-wide text-slate-300">
                {isTabletMode ? <Smartphone className="h-3.5 w-3.5 text-blue-400" /> : <Monitor className="h-3.5 w-3.5 text-green-400" />}
                Modo {isTabletMode ? "Tablet" : "Monitor"}
              </div>
              {!window.isSecureContext && (
                <div className="mt-2 rounded-lg bg-red-500/20 p-2 text-[10px] text-red-400 border border-red-500/30">
                  ⚠️ Acesso à câmera bloqueado por falta de HTTPS (Segurança)
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-4 w-full">
              {/* Botão de Configurações (engrenagem discreta) */}
              <button
                onClick={openSettings}
                className="flex items-center gap-2 self-end rounded-lg px-3 py-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
              >
                <Settings className="h-4 w-4" />
                <span className="text-[10px] uppercase">Config</span>
              </button>

              {/* Painel de Configurações (colapsável) */}
              {showSettings && (
                <div className="w-full space-y-3 rounded-xl border border-slate-700 bg-slate-800/80 p-4 animate-in fade-in duration-200">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Configurações do Totem</p>

                  <div>
                    <div className="mb-1 flex items-center gap-2 text-slate-400">
                      <Package className="h-3 w-3" />
                      <span className="text-xs">Condomínio</span>
                    </div>
                    <select
                      value={pendingTenantId}
                      onChange={(e) => setPendingTenantId(e.target.value)}
                      className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione o condomínio</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Seletor de Câmera */}
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Camera className="h-3 w-3" />
                        <span className="text-xs">Câmera {isTabletMode ? "do tablet" : "principal"}</span>
                      </div>
                      <button
                        onClick={enumerateDevices}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Atualizar
                      </button>
                    </div>
                    <select
                      value={pendingDeviceId}
                      onChange={(e) => setPendingDeviceId(e.target.value)}
                      className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="environment">Câmera Traseira</option>
                      <option value="user">Câmera Frontal</option>
                      {videoDevices.filter(d => d.deviceId !== "").map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Câmera ${videoDevices.indexOf(device) + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Toggle Espelhamento */}
                  <button
                    onClick={() => setIsMirrored(!isMirrored)}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-700/60 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                  >
                    <span className="text-xs">Espelhar Câmera</span>
                    <div className={`h-5 w-10 rounded-full p-1 transition-colors ${isMirrored ? 'bg-blue-600' : 'bg-slate-600'}`}>
                      <div className={`h-3 w-3 rounded-full bg-white transition-transform ${isMirrored ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </button>

                  <div>
                    <div className="mb-1 flex items-center gap-2 text-slate-400">
                      <Lock className="h-3 w-3" />
                      <span className="text-xs">Nova senha das configurações</span>
                    </div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Deixe em branco para manter"
                      className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={saveTotemSettings}
                    disabled={!pendingTenantId}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Salvar no totem
                  </button>
                </div>
              )}

              {!activeTenantId && (
                <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-300">
                  Configure o condomínio para habilitar leitura de QR e destrava da porta.
                </div>
              )}

              <div className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-5 py-3 w-full">
                <QrCode className="h-8 w-8 shrink-0 text-blue-400" />
                <div>
                  <p className="text-sm font-semibold">Escaneie o QR Code</p>
                  <p className="text-xs text-slate-400">da etiqueta da encomenda</p>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-700" />

              <button
                onClick={() => setShowManualInput(true)}
                className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-5 py-3 transition-colors hover:bg-slate-700"
              >
                <Keyboard className="h-8 w-8 shrink-0 text-slate-400" />
                <div className="text-left">
                  <p className="text-sm font-semibold">Digitar Código</p>
                  <p className="text-xs text-slate-400">manualmente</p>
                </div>
              </button>

              {/* Ambiente Monitorado - RTSP Camera */}
              {rtspCameraUrl && (
                <CameraFeed url={rtspCameraUrl} />
              )}
            </div>

            <div className="w-full pb-8">
              {showManualInput ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    autoFocus
                    className="w-full rounded-xl bg-slate-700 px-4 py-3 text-center text-lg font-mono text-white placeholder-slate-500 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ENC-XXXXX-XXXX"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && searchDelivery(manualCode)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => searchDelivery(manualCode)}
                      disabled={!manualCode.trim() || loading}
                      className="flex-1 rounded-xl bg-blue-600 py-3 font-semibold transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Buscar"}
                    </button>
                    <button
                      onClick={() => { setShowManualInput(false); setManualCode(""); }}
                      className="rounded-xl bg-slate-700 px-4 py-3 text-sm text-slate-300 hover:bg-slate-600"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <a
                  href="https://luizaugusto.me"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-slate-600 transition-colors hover:text-slate-400"
                >
                  Desenvolvido por LAVB Tecnologias
                </a>
              )}
            </div>
          </div>
        </div>
      )
      }

      {/* ===== FOUND: Encomenda encontrada - confirmação de identidade ===== */}
      {
        step === "found" && delivery && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
            <Package className="h-16 w-16 text-green-400" />
            <h2 className="text-3xl font-bold">Encomenda Encontrada</h2>

            <div className="w-full max-w-md rounded-2xl bg-slate-700/50 p-8 space-y-4">
              <div className="flex items-center gap-5">
                {delivery.user.photoUrl ? (
                  <img
                    src={delivery.user.photoUrl}
                    alt="Morador"
                    className="h-24 w-24 rounded-full border-3 border-blue-400 object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-600">
                    <UserCheck className="h-12 w-12 text-slate-400" />
                  </div>
                )}
                <div>
                  <p className="text-2xl font-bold">{delivery.user.name}</p>
                  <p className="text-lg text-slate-300">
                    {delivery.unit.type} {delivery.unit.number}
                    {delivery.unit.block ? ` - Bloco ${delivery.unit.block}` : ""}
                  </p>
                </div>
              </div>

              <hr className="border-slate-600" />

              <div className="space-y-2 text-base">
                <p><span className="text-slate-400">Código:</span> <span className="font-mono">{delivery.code}</span></p>
                <p><span className="text-slate-400">Local:</span> {delivery.location.code}</p>
                <p><span className="text-slate-400">Recebida em:</span> {new Date(delivery.createdAt).toLocaleString("pt-BR")}</p>
              </div>
            </div>

            <p className="text-xl text-slate-300">
              Você é <strong>{delivery.user.name}</strong>?
            </p>

            <div className="flex w-full max-w-md gap-4">
              <button
                onClick={() => startFaceCapture()}
                className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-green-600 px-6 py-5 text-xl font-semibold hover:bg-green-700"
              >
                <CheckCircle className="h-7 w-7" />
                Sim, sou eu
              </button>
              <button
                onClick={handleNotMe}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-3 rounded-xl bg-amber-600 px-6 py-5 text-xl font-semibold hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Users className="h-7 w-7" />}
                Não sou eu
              </button>
            </div>

            <button onClick={goToScan} className="text-slate-400 hover:text-white">
              ← Cancelar
            </button>
          </div>
        )
      }

      {/* ===== SELECT-RESIDENT: Seleção de morador da unidade ===== */}
      {
        step === "select-resident" && delivery && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
            <Users className="h-14 w-14 text-amber-400" />
            <h2 className="text-3xl font-bold">Quem está retirando?</h2>
            <p className="text-lg text-slate-300">
              Apenas moradores da{" "}
              <strong>
                {delivery.unit.type} {delivery.unit.number}
                {delivery.unit.block ? ` - Bloco ${delivery.unit.block}` : ""}
              </strong>{" "}
              podem retirar esta encomenda.
            </p>

            <div className="grid w-full max-w-lg gap-3">
              {residents.map((r) => (
                <button
                  key={r.id}
                  onClick={() => startFaceCapture(r)}
                  className="flex items-center gap-4 rounded-xl bg-slate-700/60 px-6 py-4 text-left transition-colors hover:bg-slate-600"
                >
                  {r.photoUrl ? (
                    <img src={r.photoUrl} alt={r.name} className="h-14 w-14 rounded-full object-cover border-2 border-amber-400" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-500">
                      <UserCheck className="h-7 w-7 text-slate-300" />
                    </div>
                  )}
                  <span className="text-xl font-semibold">{r.name}</span>
                </button>
              ))}
            </div>

            <button onClick={goToScan} className="mt-4 text-slate-400 hover:text-white">
              ← Cancelar
            </button>
          </div>
        )
      }

      {/* ===== CAMERA-FACE: Captura de foto do rosto ===== */}
      {
        step === "camera-face" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-6">
            <h2 className="text-2xl font-bold">📸 Foto do Rosto</h2>
            <p className="text-slate-300">
              {selectedResident ? selectedResident.name : delivery?.user.name}, posicione seu rosto na câmera
            </p>

            <div className="relative w-full max-w-lg flex-1 max-h-[55vh] rounded-2xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-72 w-52 rounded-[50%] border-4 border-blue-400 opacity-50" />
              </div>
            </div>

            <button
              onClick={takeFacePhoto}
              className="flex w-full max-w-lg items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-5 text-xl font-semibold hover:bg-blue-700 active:scale-95 transition-transform"
            >
              <Camera className="h-7 w-7" />
              Tirar Foto do Rosto
            </button>

            <button onClick={goToScan} className="text-slate-400 hover:text-white">
              ← Cancelar
            </button>
          </div>
        )
      }

      {/* ===== CAMERA-PACKAGE: Captura de foto segurando a encomenda ===== */}
      {
        step === "camera-package" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black p-6">
            <h2 className="text-2xl font-bold">📦 Foto com a Encomenda</h2>
            <p className="text-slate-300">
              Segure a encomenda e posicione na frente da câmera
            </p>

            {capturedFacePhoto && (
              <div className="flex items-center gap-2">
                <img
                  src={capturedFacePhoto}
                  alt="Rosto"
                  className="h-12 w-12 rounded-full border-2 border-green-400 object-cover"
                  style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                />
                <span className="text-sm text-green-400">✓ Rosto capturado</span>
              </div>
            )}

            <div className="relative w-full max-w-lg flex-1 max-h-[50vh] rounded-2xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-64 rounded-2xl border-4 border-amber-400 opacity-50" />
              </div>
            </div>

            <button
              onClick={takePackagePhoto}
              className="flex w-full max-w-lg items-center justify-center gap-3 rounded-2xl bg-amber-600 px-8 py-5 text-xl font-semibold hover:bg-amber-700 active:scale-95 transition-transform"
            >
              <Package className="h-7 w-7" />
              Tirar Foto com Encomenda
            </button>

            <button onClick={goToScan} className="text-slate-400 hover:text-white">
              ← Cancelar
            </button>
          </div>
        )
      }

      {/* ===== CONFIRM: Revisão das fotos + confirmação ===== */}
      {
        step === "confirm" && delivery && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
            <UserCheck className="h-14 w-14 text-green-400" />
            <h2 className="text-3xl font-bold">Confirmar Retirada</h2>

            <div className="flex items-center gap-6">
              {capturedFacePhoto && (
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={capturedFacePhoto}
                    alt="Foto rosto"
                    className="h-36 w-36 rounded-full border-4 border-green-400 object-cover"
                    style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                  />
                  <span className="text-sm text-slate-400">Rosto</span>
                </div>
              )}
              {capturedPackagePhoto && (
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={capturedPackagePhoto}
                    alt="Foto encomenda"
                    className="h-36 w-48 rounded-xl border-4 border-amber-400 object-cover"
                  />
                  <span className="text-sm text-slate-400">Encomenda</span>
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-xl"><strong>{withdrawerName}</strong></p>
              {selectedResident && (
                <p className="text-sm text-amber-400">
                  Retirando para {delivery.user.name}
                </p>
              )}
              <p className="font-mono text-slate-400">{delivery.code}</p>
            </div>

            <div className="flex w-full max-w-md gap-4">
              <button
                onClick={confirmWithdraw}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-5 text-xl font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle className="h-6 w-6" />}
                Confirmar Retirada
              </button>
              <button
                onClick={() => {
                  setCapturedFacePhoto(null);
                  setCapturedFaceBlob(null);
                  setCapturedPackagePhoto(null);
                  setCapturedPackageBlob(null);
                  startFaceCapture(selectedResident || undefined);
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-6 py-5 text-lg font-semibold hover:bg-slate-600"
              >
                <RotateCcw className="h-6 w-6" />
                Refazer
              </button>
            </div>

            <button onClick={goToScan} className="text-slate-400 hover:text-white">
              ← Cancelar
            </button>
          </div>
        )
      }

      {/* ===== SUCCESS ===== */}
      {
        step === "success" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-5 p-8">

            {/* Banner da porta destravada */}
            <DoorUnlockBanner seconds={10} />

            {/* Ícone + título */}
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-green-600/20 p-6">
                <CheckCircle className="h-24 w-24 text-green-400" />
              </div>
              <h2 className="text-4xl font-bold text-green-400">Encomenda Retirada!</h2>
              {delivery && (
                <p className="font-mono text-lg text-slate-400">{delivery.code}</p>
              )}
            </div>

            {/* Miniaturas das fotos capturadas */}
            {(capturedFacePhoto || capturedPackagePhoto) && (
              <div className="flex items-center gap-4">
                {capturedFacePhoto && (
                  <div className="flex flex-col items-center gap-1">
                    <img src={capturedFacePhoto} alt="Foto do rosto" className="h-24 w-24 rounded-xl object-cover ring-2 ring-green-500/50" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">Rosto</span>
                  </div>
                )}
                {capturedPackagePhoto && (
                  <div className="flex flex-col items-center gap-1">
                    <img src={capturedPackagePhoto} alt="Foto da encomenda" className="h-24 w-24 rounded-xl object-cover ring-2 ring-blue-500/50" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">Encomenda</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={goToScan}
              className="rounded-2xl bg-blue-600 px-12 py-4 text-xl font-semibold hover:bg-blue-700"
            >
              Voltar ao Início
            </button>
            <AutoRedirect onTimeout={goToScan} seconds={10} />
          </div>
        )
      }

      {/* ===== ERROR ===== */}
      {
        step === "error" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
            <div className="rounded-full bg-red-600/20 p-8">
              <XCircle className="h-28 w-28 text-red-400" />
            </div>
            <h2 className="text-4xl font-bold text-red-400">Ops!</h2>
            <p className="text-2xl text-slate-300">{error || "Algo deu errado"}</p>

            <button
              onClick={goToScan}
              className="mt-6 rounded-2xl bg-blue-600 px-12 py-4 text-xl font-semibold hover:bg-blue-700"
            >
              Tentar Novamente
            </button>
            <AutoRedirect onTimeout={goToScan} seconds={10} />
          </div>
        )
      }

      {/* CSS for scan line animation */}
      <style jsx global>{`
        @keyframes scanLine {
          0%, 100% { top: 20%; }
          50% { top: 80%; }
        }
      `}</style>
    </div >
  );
}

function DoorUnlockBanner({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const urgent = remaining <= 3;

  return (
    <div
      className={`w-full max-w-2xl rounded-2xl border-2 px-6 py-4 text-center transition-colors duration-500 ${
        urgent
          ? "border-red-500 bg-red-500/20 animate-pulse"
          : "border-amber-400 bg-amber-400/10"
      }`}
    >
      <p className={`text-2xl font-black uppercase tracking-widest drop-shadow-lg ${urgent ? "text-red-400" : "text-amber-300"}`}>
        🔓 A PORTA ESTÁ DESTRAVADA!
      </p>
      <p className={`mt-1 text-4xl font-black tabular-nums ${urgent ? "text-red-300" : "text-amber-200"}`}>
        {remaining}s
      </p>
      <p className={`text-sm font-semibold uppercase tracking-wider ${urgent ? "text-red-400/80" : "text-amber-400/80"}`}>
        para você sair
      </p>
    </div>
  );
}

function AutoRedirect({ onTimeout, seconds }: { onTimeout: () => void; seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onTimeout, seconds]);

  return (
    <p className="text-sm text-slate-500">
      Voltando ao início em {remaining}s...
    </p>
  );
}
