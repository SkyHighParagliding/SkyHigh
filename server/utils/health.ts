import fs from 'fs';
import path from 'path';
import db from '../db.js';
import createLogger from './logger.js';

const log = createLogger('health');

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    connected: boolean;
    latency: number;
  };
  fileSystem: {
    distAvailable: boolean;
    indexAvailable: boolean;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    percentage: number;
  };
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message?: string;
  }[];
}

const startTime = Date.now();

/**
 * Test database connectivity and measure latency
 */
async function checkDatabase(): Promise<{ connected: boolean; latency: number }> {
  const start = Date.now();
  try {
    await db.prepare("SELECT 1").get();
    const latency = Date.now() - start;
    return { connected: true, latency };
  } catch (e: any) {
    log.error(`Database health check failed: ${e.message}`);
    return { connected: false, latency: -1 };
  }
}

/**
 * Check file system prerequisites
 */
function checkFileSystem(): { distAvailable: boolean; indexAvailable: boolean } {
  const cwd = process.cwd();
  return {
    distAvailable: fs.existsSync(path.join(cwd, 'dist')),
    indexAvailable: fs.existsSync(path.join(cwd, 'index.html')),
  };
}

/**
 * Get memory usage information
 */
function getMemoryUsage() {
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
  const percentage = Math.round((heapUsed / heapTotal) * 100);

  return {
    heapUsed,
    heapTotal,
    percentage,
  };
}

/**
 * Perform all health checks
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Database check
  const dbHealth = await checkDatabase();
  if (dbHealth.connected) {
    checks.push({
      name: 'database',
      status: dbHealth.latency > 100 ? 'warn' : 'pass',
      message: `Latency: ${dbHealth.latency}ms`,
    });
    if (dbHealth.latency > 100) {
      overallStatus = 'degraded';
    }
  } else {
    checks.push({
      name: 'database',
      status: 'fail',
      message: 'Unable to connect to database',
    });
    overallStatus = 'unhealthy';
  }

  // File system check
  const fsHealth = checkFileSystem();
  if (!fsHealth.distAvailable || !fsHealth.indexAvailable) {
    checks.push({
      name: 'filesystem',
      status: 'warn',
      message: 'Missing dist or index.html',
    });
    overallStatus = 'degraded';
  } else {
    checks.push({
      name: 'filesystem',
      status: 'pass',
    });
  }

  // Memory check
  const memory = getMemoryUsage();
  if (memory.percentage > 90) {
    checks.push({
      name: 'memory',
      status: 'fail',
      message: `High memory usage: ${memory.percentage}%`,
    });
    overallStatus = 'unhealthy';
  } else if (memory.percentage > 75) {
    checks.push({
      name: 'memory',
      status: 'warn',
      message: `Elevated memory usage: ${memory.percentage}%`,
    });
    overallStatus = 'degraded';
  } else {
    checks.push({
      name: 'memory',
      status: 'pass',
    });
  }

  const uptime = Date.now() - startTime;

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime,
    environment: process.env.NODE_ENV || 'development',
    database: dbHealth,
    fileSystem: fsHealth,
    memory,
    checks,
  };
}
