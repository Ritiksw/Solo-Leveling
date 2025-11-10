export const firebaseConfig = {
  apiKey: 'AIzaSyD1mED0iqRW_1F0iTzslPfyYX6V2EUaTCw',
  authDomain: 'solo-gym-leveling-5fdfa.firebaseapp.com',
  projectId: 'solo-gym-leveling-5fdfa',
  storageBucket: 'solo-gym-leveling-5fdfa.appspot.com',
  messagingSenderId: '871482471113',
  appId: '1:871482471113:web:f4a1e0390c1fc372e2d318',
  // measurementId: 'YOUR_FIREBASE_MEASUREMENT_ID'
};

export const firebaseOptions = {
  enabled: !Object.values(firebaseConfig).some(value =>
    typeof value === 'string' && value.startsWith('YOUR_FIREBASE')
  )
};

