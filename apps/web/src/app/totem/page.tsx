"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import jsQR from "jsqr";
import {
  Package, QrCode, Camera, CheckCircle, XCircle,
  Keyboard, Loader2, UserCheck, RotateCcw, Users, Shield,
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

export default function TotemPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-slate-900"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>}>
      <TotemContent />
    </Suspense>
  );
}

function TotemContent() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenant") || "";
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
  const [logoError, setLogoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef<boolean>(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  // Inactivity timer - back to scan after 60s
  const inactivityRef = useRef<NodeJS.Timeout | null>(null);
  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      stopCamera();
      resetState();
      setStep("scan");
    }, 60000);
  }, []);

  // Start camera on mount (directly in scan mode)
  useEffect(() => {
    startCamera("environment").then(() => startQrScanning());
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      stopQrScanning();
      stopCamera();
    };
  }, []);

  // Load RTSP config if tenantId provided
  useEffect(() => {
    if (tenantId) {
      api.totemGetRtspConfig(tenantId).then((data: any) => {
        if (data?.rtspCameraUrl) setRtspCameraUrl(data.rtspCameraUrl);
      }).catch(() => {});
    }
  }, [tenantId]);

  // Manage camera based on step changes
  useEffect(() => {
    resetInactivity();
    if (step === "scan") {
      startCamera("environment").then(() => startQrScanning());
      setShowManualInput(false);
    } else {
      stopQrScanning();
    }
  }, [step]);

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
  async function startCamera(facingMode: "environment" | "user" = "environment") {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
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
      if (!video || video.readyState < 2) return;

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
    }, 250);
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
    setLoading(true);
    setError("");
    resetInactivity();
    try {
      const result = await api.totemFindByCode(code.trim());
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
    await startCamera("environment");
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
      const result = await api.totemGetResidents(delivery.code);
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
        photos.push(new File([capturedFaceBlob], "face.jpg", { type: "image/jpeg" }));
      }
      if (capturedPackageBlob) {
        photos.push(new File([capturedPackageBlob], "package.jpg", { type: "image/jpeg" }));
      }
      const withdrawnById = selectedResident?.id;
      await api.totemWithdraw(delivery.code, photos, withdrawnById);
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

  const withdrawerName = selectedResident?.name || delivery?.user.name || "";

  // =================== RENDER ===================
  return (
    <div className="h-screen w-screen overflow-hidden" onClick={resetInactivity}>
      <canvas ref={canvasRef} className="hidden" />

      {/* ===== SCAN: Tela principal - câmera 70% + painel lateral 30% ===== */}
      {step === "scan" && (
        <div className="flex h-full w-full">
          {/* Câmera - 70% da tela */}
          <div className="relative h-full" style={{ width: "70%" }}>
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />

            {/* QR Frame overlay + Face Frame */}
            <div className="absolute inset-0 flex items-center justify-between px-[3%]">
              {/* Face frame - lado esquerdo (grande, circular) */}
              <div className="relative flex flex-col items-center" style={{ marginLeft: "5%" }}>
                <div className="relative h-[22rem] w-[22rem] rounded-full border-4 border-green-400 shadow-[0_0_40px_rgba(34,197,94,0.15)] lg:h-[28rem] lg:w-[28rem]">
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
                <div className="relative h-56 w-56 rounded-2xl border-4 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)] lg:h-72 lg:w-72">
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
          <div className="flex h-full flex-col items-center justify-between bg-slate-900 p-6" style={{ width: "30%" }}>
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
                Posicione a encomenda com o QR Code visível na câmera
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex items-center gap-3 rounded-xl bg-slate-800/80 px-5 py-3">
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
                      <img
                        src={rtspCameraUrl}
                        alt="Câmera de monitoramento"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                      <div className="hidden absolute inset-0 flex items-center justify-center text-slate-500">
                        <Camera className="h-8 w-8" />
                      </div>
                      <div className="absolute left-2 top-2 flex items-center gap-1">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                        <span className="text-[10px] font-medium text-red-400">REC</span>
                      </div>
                    </div>
                  </div>
                </>
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
                <p className="text-center text-xs text-slate-600">
                  Sistema de retirada automática de encomendas
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== FOUND: Encomenda encontrada - confirmação de identidade ===== */}
      {step === "found" && delivery && (
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
      )}

      {/* ===== SELECT-RESIDENT: Seleção de morador da unidade ===== */}
      {step === "select-resident" && delivery && (
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
      )}

      {/* ===== CAMERA-FACE: Captura de foto do rosto ===== */}
      {step === "camera-face" && (
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
              style={{ transform: "scaleX(-1)" }}
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
      )}

      {/* ===== CAMERA-PACKAGE: Captura de foto segurando a encomenda ===== */}
      {step === "camera-package" && (
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
                style={{ transform: "scaleX(-1)" }}
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
      )}

      {/* ===== CONFIRM: Revisão das fotos + confirmação ===== */}
      {step === "confirm" && delivery && (
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
                  style={{ transform: "scaleX(-1)" }}
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
      )}

      {/* ===== SUCCESS ===== */}
      {step === "success" && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8">
          <div className="rounded-full bg-green-600/20 p-8">
            <CheckCircle className="h-28 w-28 text-green-400" />
          </div>
          <h2 className="text-4xl font-bold text-green-400">Encomenda Retirada!</h2>
          <p className="text-2xl text-slate-300">Retire sua encomenda no local indicado.</p>
          {delivery && (
            <p className="font-mono text-lg text-slate-400">{delivery.code}</p>
          )}

          <button
            onClick={goToScan}
            className="mt-6 rounded-2xl bg-blue-600 px-12 py-4 text-xl font-semibold hover:bg-blue-700"
          >
            Voltar ao Início
          </button>
          <AutoRedirect onTimeout={goToScan} seconds={10} />
        </div>
      )}

      {/* ===== ERROR ===== */}
      {step === "error" && (
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
      )}

      {/* CSS for scan line animation */}
      <style jsx global>{`
        @keyframes scanLine {
          0%, 100% { top: 20%; }
          50% { top: 80%; }
        }
      `}</style>
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
