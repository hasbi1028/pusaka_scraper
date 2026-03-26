/**
 * Phusion Passenger Entry Point
 * File: passenger_entry_point.js
 */

import { handler } from './frontend/build/handler.js';
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();

// 1. Jalankan Worker sebagai Background Process
// Pastikan 'bun' terinstall di server, atau ganti ke 'node' jika worker sudah dicompile
const startWorker = () => {
    console.log('Starting worker process...');
    const worker = spawn('bun', ['src/index.ts'], {
        stdio: 'inherit',
        env: { ...process.env }
    });

    worker.on('exit', (code) => {
        console.log(`Worker exited with code ${code}. Restarting in 5s...`);
        setTimeout(startWorker, 5000);
    });
};

// Hanya jalankan worker jika bukan di environment yang membatasi background task
if (process.env.NODE_ENV === 'production') {
    startWorker();
}

// 2. SvelteKit Handler
app.use(handler);

// Passenger akan menentukan port secara otomatis via environment variable
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Pusaka Scraper running on port ${port}`);
});
