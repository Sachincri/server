import winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for console logging
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

const activeTransports: winston.transport[] = [];

// Sirf tab File transport use karein jab hum Vercel par na ho (e.g. Local ya Render par jahan file likhna allow ho)
// Vercel serverless functions read-only file system ke sath aati hain, isliye error aata hai.
if (!process.env.VERCEL) {
  activeTransports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

// Console transport hamesha add karein taaki Render aur Vercel dono ke dashboard par logs dikhein
activeTransports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV !== 'production'
      ? combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), consoleFormat)
      : combine(timestamp(), json())
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  defaultMeta: { service: 'serverts' },
  transports: activeTransports,
});

export default logger;