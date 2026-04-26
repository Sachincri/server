const dotenv = require('dotenv');
dotenv.config();

const key = process.env.NVIDIA_API_KEY;

const models = [
    "stabilityai/sdxl",
    "stabilityai/stable-diffusion-xl",
    "stabilityai/sd-xl-base-1-0",
    "stabilityai/stable-diffusion-3-5-large",
    "nvidia/stable-diffusion-xl",
];

async function runTests() {
    for (const model of models) {
        console.log(`\nTesting Model: ${model}`);
        const url = `https://ai.api.nvidia.com/v1/genai/stabilityai/${model.split('/').pop()}`;
        console.log(`URL: ${url}`);
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    text_prompts: [{ text: "A cute cat", weight: 1 }],
                    cfg_scale: 7,
                    steps: 30
                })
            });

            console.log(`Status: ${response.status} ${response.statusText}`);
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                if (response.ok) {
                    console.log("✅ Success!");
                } else {
                    console.log("❌ Failed:", data.detail || data.title || text.substring(0, 100));
                }
            } catch {
                console.log("❌ Failed (Non-JSON):", text.substring(0, 100));
            }
        } catch (err) {
            console.log("💥 Error:", err.message);
        }
    }
}

runTests();
