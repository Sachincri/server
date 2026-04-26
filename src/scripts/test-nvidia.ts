import dotenv from 'dotenv';
dotenv.config();

const testNvidia = async () => {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) {
        console.log("No key found.");
        return;
    }
    
    const endpoints = [
        "https://integrate.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl",
        "https://ai.api.nvidia.com/v1/genai/stabilityai/sdxl",
        "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl",
    ];
    
    for (const ep of endpoints) {
        console.log(`Testing ${ep}...`);
        try {
            const res = await fetch(ep, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    text_prompts: [{ text: "A cute cat", weight: 1 }],
                    cfg_scale: 5,
                    sampler: "K_DPM_2_ANCESTRAL",
                    seed: 0,
                    steps: 25
                })
            });
            console.log(`- Status: ${res.status} ${res.statusText}`);
            if (res.status === 200) {
                console.log("- Success!");
                const data = await res.json() as any;
                console.log(Object.keys(data));
            } else {
                const txt = await res.text();
                console.log(`- Body: ${txt.substring(0, 500)}`);
            }
        } catch (e: any) {
            console.log(`- Error: ${e.message}`);
        }
    }
};

testNvidia();
