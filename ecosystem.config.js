module.exports = {
    apps: [{
        name: "serverts",
        script: "./dist/src/server.js",

        // ── Cluster Mode — scaled for 10K concurrent users ──
        instances: 4,           // 4 workers (use "max" for all CPU cores)
        exec_mode: "cluster",   // Cluster mode for load balancing

        // ── Memory Management ──
        max_memory_restart: "512M",   // Restart if worker exceeds 512MB (was 1G)
        node_args: "--max-old-space-size=512",  // V8 heap limit per worker

        // ── Stability ──
        watch: false,
        autorestart: true,
        max_restarts: 10,
        min_uptime: "10s",
        restart_delay: 4000,         // 4s delay between restarts
        kill_timeout: 5000,          // 5s graceful shutdown timeout
        listen_timeout: 10000,       // 10s for worker to signal ready

        // ── Logging ──
        log_date_format: "YYYY-MM-DD HH:mm:ss Z",
        error_file: "./logs/pm2-error.log",
        out_file: "./logs/pm2-out.log",
        merge_logs: true,            // Merge logs from all workers

        // ── Environment ──
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        }
    }]
}
