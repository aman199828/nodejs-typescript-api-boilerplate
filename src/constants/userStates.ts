/**
 * User State Constants
 * These match the Laravel model constants for consistency
 */
export enum UserState {
  INACTIVE = 0,
  ACTIVE = 1,
  PENDING = 3,
  DELETED = 4,
  REJECTED = 5,
  BLOCKED = 6,
}

/**
 * User State Labels for display purposes
 */
export const UserStateLabels = {
  [UserState.INACTIVE]: 'Inactive',
  [UserState.ACTIVE]: 'Active',
  [UserState.PENDING]: 'Pending',
  [UserState.DELETED]: 'Deleted',
  [UserState.REJECTED]: 'Rejected',
  [UserState.BLOCKED]: 'Blocked',
} as const;

/**
 * User State Descriptions
 */
export const UserStateDescriptions = {
  [UserState.INACTIVE]: 'User account is inactive',
  [UserState.ACTIVE]: 'User account is active (can login)',
  [UserState.PENDING]: 'User account is pending approval',
  [UserState.DELETED]: 'User account is deleted (soft delete)',
  [UserState.REJECTED]: 'User account is rejected',
  [UserState.BLOCKED]: 'User account is blocked',
} as const;

/**
 * Get user state label
 */
export const getUserStateLabel = (state: UserState): string => {
  return UserStateLabels[state] || 'Unknown';
};

/**
 * Get user state description
 */
export const getUserStateDescription = (state: UserState): string => {
  return UserStateDescriptions[state] || 'Unknown state';
};

/**
 * Check if user can login with given state
 */
export const canUserLogin = (state: UserState): boolean => {
  return state === UserState.ACTIVE;
};

/**
 * Get all available user states
 */
export const getAllUserStates = () => {
  return Object.values(UserState).filter(value => typeof value === 'number') as UserState[];
};

/**
 * Get user states with labels and descriptions
 */
export const getUserStatesWithDetails = () => {
  return getAllUserStates().map(state => ({
    id: state,
    label: getUserStateLabel(state),
    description: getUserStateDescription(state),
    canLogin: canUserLogin(state),
  }));
};
