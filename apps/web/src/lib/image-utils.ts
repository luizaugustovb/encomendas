export async function compressImage(file: File, maxKb: number = 200, maxWidth: number = 1000): Promise<File> {
    return new Promise((resolve, reject) => {
        // Apenas comprime se for imagem
        if (!file.type.startsWith('image/')) {
            return resolve(file);
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve(file);

                ctx.fillStyle = "#fff"; // Fundo branco p/ PNG transparente virando JPG
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, width, height);

                let quality = 0.9;
                const compress = () => {
                    canvas.toBlob((blob) => {
                        if (!blob) return resolve(file);
                        const sizeKb = blob.size / 1024;

                        if (sizeKb <= maxKb || quality <= 0.1) {
                            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                                type: "image/jpeg",
                            });
                            resolve(newFile);
                        } else {
                            quality -= 0.1;
                            compress(); // recursão até baixar de maxKb
                        }
                    }, "image/jpeg", quality);
                };
                compress();
            };
            img.onerror = (e) => resolve(file); // fallback p/ original
        };
        reader.onerror = (e) => resolve(file); // fallback
    });
}
