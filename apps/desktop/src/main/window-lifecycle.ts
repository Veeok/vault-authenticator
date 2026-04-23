type WindowClosePolicyInput = {
  isQuitting: boolean;
  runInBackground: boolean;
};

export function shouldHideOnWindowClose(input: WindowClosePolicyInput): boolean {
  if (input.isQuitting) {
    return false;
  }
  return input.runInBackground;
}
