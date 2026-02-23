module.exports = {
    apps: [{
        name: "serverts",
        script: "./dist/src/server.js",
        instances: "max", // Or a specific number, e.g., 2
        exec_mode: "cluster",
        watch: false,
        max_memory_restart: "1G",
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        }
    }]
}
