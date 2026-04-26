const dotenv = require('dotenv');
dotenv.config();

const key = process.env.NVIDIA_API_KEY;

if (!key) {
    console.error("NVIDIA_API_KEY missing in .env");
    process.exit(1);
}

const tests = [
    {
        name: "Integrate SDXL v1",
        url: "https://integrate.api.nvidia.com/v1/images/generations",
        body: {
            model: "stabilityai/sdxl",
            prompt: "A professional e-commerce banner for a winter sale",
            n: 1,
            size: "1024x1024"
        }
    },
    {
        name: "GenAI SDXL v1",
        url: "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl",
        body: {
            text_prompts: [{ text: "A professional e-commerce banner for a winter sale", weight: 1 }],
            cfg_scale: 7,
            steps: 30
        }
    },
    {
        name: "GenAI SDXL shorthand",
        url: "https://ai.api.nvidia.com/v1/genai/stabilityai/sdxl",
        body: {
            text_prompts: [{ text: "A professional e-commerce banner for a winter sale", weight: 1 }],
            cfg_scale: 7,
            steps: 30
        }
    }
];

async function runTests() {
    for (const t of tests) {
        console.log(`\nTesting ${t.name}...`);
        console.log(`URL: ${t.url}`);
        try {
            const response = await fetch(t.url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(t.body)
            });

            console.log(`Status: ${response.status} ${response.statusText}`);
            const data = await response.json();
            if (response.ok) {
                console.log("✅ Success!");
                // console.log("Keys in response:", Object.keys(data));
            } else {
                console.log("❌ Failed:", JSON.stringify(data, null, 2));
            }
        } catch (err) {
            console.log("💥 Error:", err.message);
        }
    }
}

runTests();
