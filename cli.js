#!/usr/bin/env node

'use strict';

/**
 * @copyright 2018-present, Charlike Mike Reagent (https://tunnckocore.com)
 * @license Apache-2.0
 */

const proc = require('process');
const path = require('path');
const mri = require('mri');
const ora = require('ora');
const fs = require('fs-extra');

const { getFiles } = require('./src/utils');
const bridge = require('./src/bridge');
const build = require('./src/build');
const lint = require('./src/lint');
const flowtype = require('./src/flowtype/index');
const flowStrip = require('./src/flowtype/flow-strip');

const utils = require('./src/utils');

const argv = mri(proc.argv.slice(2), {
  default: { esm: true, build: true, dbg: false },
  boolean: ['warnings'],
});

if (argv.force) {
  const jsCacheFile = utils.getCacheFile(argv.dbg);
  const eslintCache = path.join(path.dirname(jsCacheFile), '.esmc-cache-lint');

  fs.removeSync(jsCacheFile);
  fs.removeSync(eslintCache);
  fs.removeSync(path.join(proc.cwd(), 'dist'));
}

let spinner = null;

function runFlow(input) {
  spinner = ora('Code type checking...').start();

  const promise = input.length > 0 ? flowtype(input, argv) : Promise.resolve();
  return promise.then(() => spinner.succeed());
}
function runLint(input) {
  spinner = ora('Code style linting...').start();

  const promise = input.length > 0 ? lint(input, argv) : Promise.resolve();
  return promise.then(() => spinner.succeed());
}
function runBuild(input) {
  spinner = ora('Source files compiling...').start();

  const prom = input.length > 0 ? build(input, argv) : Promise.resolve();
  return prom.then(() => spinner.succeed()).catch((err) => {
    console.error(utils.fixBabelErrors(err));
    throw err;
  });
}
function runBridge(input) {
  spinner = ora('Creating bridge file...').start();

  const promise = input.length > 0 ? bridge() : Promise.resolve();
  return promise.then(() => spinner.succeed());
}
function runFlowStrip(input, opts) {
  spinner = ora('Removing types...').start();

  return (input.length > 0
    ? flowStrip(input, opts, argv)
    : Promise.resolve()
  ).then(() => spinner.succeed());
}

const onfail = (err) => {
  spinner.fail();
  console.log(err);
  proc.exit(1);
};

const cmd = argv._[0];

if (cmd === 'lint') {
  /**
   * Only lint the source files
   */
  getFiles(argv)
    .then(async ({ files, cacheFile, monitor }) => {
      await runLint(files);
      monitor.write(cacheFile);
      return true;
    })
    .catch(onfail);
} else if (cmd === 'build') {
  /**
   * Only build/compile all the source files
   */
  getFiles(argv)
    .then(async ({ files, cacheFile, monitor }) => {
      await runBuild(files);
      monitor.write(cacheFile);
      return true;
    })
    .catch(onfail);
} else {
  if (!argv.esm && !argv.build) {
    console.error(
      `${utils.colors.red('fatal')}:`,
      utils.colors.bold('Cannot use --no-build and --no-esm flags together'),
      utils.colors.dim('(null)'),
      'at',
      utils.colors.green('esmc'),
    );
    proc.exit(1);
  }
  /**
   * Type check, lint check, building/compiling all files
   */
  getFiles(argv)
    .then(async ({ files, cacheFile, monitor }) => {
      if (argv.flow) {
        await runFlow(files);
      }
      await runLint(files);
      if (argv.build) {
        await runBuild(files);
      } else {
        const isIgnored = utils.createIsIgnored();
        const filter = (srcFilepath) => !isIgnored(srcFilepath);
        const src = argv.dbg ? 'example-src' : 'src';

        if (argv.flow) {
          await runFlowStrip(files, { filter });
        } else {
          await fs.copy(src, 'dist/nodejs', { filter });
          await fs.copy(src, 'dist/browsers', { filter });
        }
      }
      if (argv.esm) {
        await runBridge(files);
      }

      monitor.write(cacheFile);

      return true;
    })
    .catch(onfail);
}
