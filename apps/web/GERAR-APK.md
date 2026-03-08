# Gerar APK do Totem (TWA - Trusted Web Activity)
# ==================================================
#
# OPÇÃO 1 (Mais Fácil): PWABuilder.com
# ------------------------------------
# 1. Acesse https://pwabuilder.com
# 2. Cole a URL: https://encomendas.justicebox.com.br/totem
# 3. Clique "Start" → "Package for stores" → "Android"
# 4. Preencha:
#    - Package ID: com.justicebox.totem
#    - App name: Totem Encomendas
#    - Host: encomendas.justicebox.com.br
#    - Start URL: /totem
#    - Display: fullscreen
# 5. Baixe o APK gerado e instale no tablet
#
# OPÇÃO 2: Bubblewrap (linha de comando)
# ----------------------------------------
# Pré-requisitos: Node.js 14+, Java JDK 11+, Android SDK
#
# Passos:
#   npm install -g @nicedreamz/nicedreamz 2>/dev/null || npm install -g @nicedreamz/nicedreamz
#   cd apps/web/twa
#   npx bubblewrap init --manifest https://encomendas.justicebox.com.br/manifest.json
#   npx bubblewrap build
#
# O APK será gerado em: apps/web/twa/app-release-signed.apk
#
# ==================================================
# DIGITAL ASSET LINKS (Obrigatório para TWA sem barra de URL)
# ==================================================
# Após gerar o APK, você precisa:
# 1. Pegar o SHA-256 fingerprint do certificado de assinatura
# 2. Criar o arquivo /.well-known/assetlinks.json no servidor
#    com o seguinte conteúdo (substituir os valores):
#
# [{
#   "relation": ["delegate_permission/common.handle_all_urls"],
#   "target": {
#     "namespace": "android_app",
#     "package_name": "com.justicebox.totem",
#     "sha256_cert_fingerprints": ["XX:XX:XX:...SEU_SHA256_AQUI"]
#   }
# }]
