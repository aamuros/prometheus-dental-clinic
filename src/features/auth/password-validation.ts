export function passwordDetails(form: FormData, recovery = false) {
  const currentPassword = String(form.get('currentPassword') ?? '');
  const newPassword = String(form.get('newPassword') ?? '');
  if (!currentPassword || currentPassword.length > 128)
    return { error: 'Enter your current password (up to 128 characters).' };
  if (newPassword.length < 12 || newPassword.length > 128)
    return { error: 'Use a new password of 12–128 characters.' };
  if (newPassword !== form.get('confirmation'))
    return { error: 'The passwords must match.' };
  if (!recovery && currentPassword === newPassword)
    return { error: 'Choose a password different from your current password.' };
  return { details: { currentPassword, newPassword } };
}
