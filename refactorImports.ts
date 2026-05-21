import * as fs from 'fs';
import * as path from 'path';

const utilMap: Record<string, string> = {
  'jwtToken': 'auth/jwtToken',
  'authCookies': 'auth/authCookies',
  'OtpGenerator': 'auth/OtpGenerator',
  'Roles.enum': 'auth/Roles.enum',
  'ApiError': 'errors/ApiError',
  'catchAsyncErrors': 'errors/catchAsyncErrors',
  'handleResponse': 'responses/handleResponse',
  'cache': 'cache/cache',
  'redisSafeWrapper': 'cache/redisSafeWrapper',
  'ttlChecker': 'cache/ttlChecker',
  'mailer': 'providers/mailer',
  'notification': 'providers/notification',
  'broadcastNotifications': 'providers/broadcastNotifications',
  'cloudinaryUpload': 'providers/cloudinaryUpload',
  'aggregationUtils': 'helpers/aggregationUtils',
  'bucket.utils': 'helpers/bucket.utils',
  'timerHelperFn': 'helpers/timerHelperFn',
  'serviceAccount': 'misc/serviceAccount',
  'items-update.json': 'misc/items-update.json'
};

const directoriesToScan = [
  'Routers',
  'Services',
  'Middlewares',
  'tests',
  'cronjob',
  'config',
  'Utils',
  'Databases'
];

const rootFilesToScan = [
  'App.ts',
  'server.ts'
];

function processFile(filePath: string) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;

  // Process Utils mappings
  for (const [oldName, newName] of Object.entries(utilMap)) {
    // Matches: '.../Utils/oldName' or ".../Utils/oldName"
    const regex = new RegExp(`(['"])(.*?)(?:\\bUtils\\/)${oldName}(['"])`, 'g');
    content = content.replace(regex, `$1$2Utils/${newName}$3`);
  }

  // Process Validators
  // Matches: '.../Validators/anyName'
  const valRegex = /(['"])(.*?)(?:\bValidators\/)(.*?)(['"])/g;
  content = content.replace(valRegex, `$1$2Utils/lib/validators/$3$4`);

  // Process proto
  // Matches: '.../proto/anyName'
  const protoRegex = /(['"])(.*?)(?:\bproto\/)(.*?)(['"])/g;
  content = content.replace(protoRegex, `$1$2Utils/lib/proto/$3$4`);

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Updated imports in: ${filePath}`);
  }
}

function scanDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.json')) {
      processFile(fullPath);
    }
  }
}

console.log("Starting refactor...");
for (const dir of directoriesToScan) {
  scanDir(path.join(__dirname, dir));
}
for (const file of rootFilesToScan) {
  if (fs.existsSync(path.join(__dirname, file))) {
    processFile(path.join(__dirname, file));
  }
}
console.log("Refactor complete.");
