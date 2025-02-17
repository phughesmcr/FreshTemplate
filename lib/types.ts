export interface User {
  id: string;
  username: string;
  // Add other user properties as needed
}

export interface ServerState {
  user: User | null;
  // Add other state properties as needed
}

// Add other shared types here
