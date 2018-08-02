'use strict';

const proc = require('process');
const path = require('path');
const util = require('util');
const babel = require('@babel/core');
const fs = require('fs-extra');

const babelPreset = require('./babel/preset');

const transformFile = util.promisify(babel.transformFile);

module.exports = async function build(files, opts, debug = false) {
  proc.env.ESMC_BROWSERS = 'false';
  proc.env.ESMC_CJS = String(!opts.esm);

  return Promise.all(files.map(createMapper('nodejs', opts, debug))).then(
    () => {
      proc.env.ESMC_BROWSERS = 'true';
      return Promise.all(files.map(createMapper('browsers', opts, debug)));
    },
  );
};

function createMapper(distType, opts, debug = false) {
  const cwd = proc.cwd();
  const dist = path.join(cwd, 'dist');

  const config = distType === 'browsers' ? babelPreset() : babelPreset();

  const dest =
    distType === 'browsers'
      ? path.join(dist, 'browsers')
      : path.join(dist, 'nodejs');

  return async (fp) => {
    const src = path.join(cwd, debug ? 'examples' : 'src');
    const distFile = fp.replace(src, dest);

    return transformFile(fp, config).then(async ({ code }) => {
      await fs.mkdirp(path.dirname(distFile));

      return fs.writeFile(distFile, code);
    });
  };
}
