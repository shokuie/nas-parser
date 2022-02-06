const commonAttrs = {
  log_target: 'elastic-search',
  tenant: process.env.TENANT,
  environment: process.env.ENV,
  region: process.env.AWS_DEFAULT_REGION,
  source: 'NA',
  version: 'NA',
  log_level: 'debug',
};

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

const logger = exports;

logger.init = (options) => {
  Object.assign(commonAttrs, options);
};

logger.log = (log_level, message, ...args) => {
  if (LOG_LEVELS[log_level] <= LOG_LEVELS[commonAttrs.log_level]) {
    console.log(JSON.stringify(Object.assign({}, commonAttrs, args[0], { log_level, message }), null, 2));
    return true;
  }

  return false;
};

Object.keys(LOG_LEVELS).forEach(method => (logger[method] = (...args) => logger.log(method, ...args)));
