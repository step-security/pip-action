import * as core from '@actions/core';
import * as exec from '@actions/exec';
import axios, { isAxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

var hasbin = require('hasbin');

export function getStringInput(name: string, options?: core.InputOptions | undefined): string | undefined {
    let tmp: string = core.getInput(name, options);
    if (tmp.length > 0) {
        return tmp;
    } else {
        return undefined;
    }
}

export function getBooleanInput(name: string, options?: core.InputOptions | undefined): boolean {
    let tmp: string = core.getInput(name, options);
    if (tmp == 'true' || tmp == '1') {
        return true;
    } else if (tmp == 'false' || tmp == '0' || tmp == '') {
        return false;
    } else {
        throw new Error('Invalid value for input ' + name);
    }
}

export let packages: string[] | undefined;
export let requirements: string | undefined;
export let constraints: string | undefined;
export let no_deps: boolean = false;
export let pre: boolean = false;
export let editable: string | undefined;
export let platform: string | undefined;
export let upgrade: boolean = false;
export let extra: string | undefined;

export function processInputs() {
    let pkgTmp: string | undefined = getStringInput('packages');
    if (pkgTmp) {
        packages = pkgTmp.split(/\s+/);
    } else {
        packages = undefined;
    }

    requirements = getStringInput('requirements');
    editable = getStringInput('editable');

    if (!packages && !requirements && !editable) {
        throw new Error('You must specify either packages, a requirements file, or an editable package');
    }

    constraints = getStringInput('constraints');
    no_deps = getBooleanInput('no-deps');
    pre = getBooleanInput('pre');
    platform = getStringInput('platform');
    upgrade = getBooleanInput('upgrade');
    extra = getStringInput('extra');
}

export function getArgs(): string[] {
    let args: string[] = ['-m', 'pip', 'install'];

    if (requirements) {
        args = args.concat('--requirement', requirements);
    }

    if (constraints) {
        args = args.concat('--constraint', constraints);
    }

    if (no_deps) {
        args = args.concat('--no-deps');
    }

    if (pre) {
        args = args.concat('--pre');
    }

    if (editable) {
        args = args.concat('--editable', editable);
    }

    if (platform) {
        args = args.concat('--platform', platform);
    }

    if (upgrade) {
        args = args.concat('--upgrade');
    }

    if (extra) {
        args = args.concat(extra);
    }

    if (packages) {
        args = args.concat(packages);
    }

    return args;
}

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'BSFishy/pip-action'
  const action = process.env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m')
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = {action: action || ''}
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      )
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

export async function run() {
    try {
        await validateSubscription();
        let python: string;
        let envLocation: string | undefined = process.env.pythonLocation;

        if (envLocation) {
            python = path.join(envLocation, 'python');
        } else {
            if (hasbin.sync('python')) {
                python = 'python';
            } else {
                throw new Error('Python could not be found');
            }
        }

        processInputs();
        let args: string[] = getArgs();

        await exec.exec(python, args);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        } else {
            core.setFailed('There was an unexpected error.')
        }
    }
}
