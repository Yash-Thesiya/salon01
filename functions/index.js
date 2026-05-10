const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.notifyCustomerOnCall =
    functions.firestore
        .document('salon/state')
        .onUpdate(async (change, context) => {
            const before = change.before.data();
            const after = change.after.data();

            const beforeQueue = before.queue || [];
            const afterQueue = after.queue || [];

            const newlyCalled = afterQueue.find(customer => {
                const prev = beforeQueue.find(
                    b => b.token === customer.token
                );
                return customer.status === 'called' &&
                    prev && prev.status !== 'called';
            });

            if (!newlyCalled) return null;

            const tokenDoc = await admin.firestore()
                .collection('fcmTokens')
                .doc(String(newlyCalled.token))
                .get();

            if (!tokenDoc.exists) {
                console.log('No FCM token for:', newlyCalled.token);
                return null;
            }

            const { fcmToken } = tokenDoc.data();

            const message = {
                token: fcmToken,
                notification: {
                    title: 'Style Zone — Your Turn!',
                    body: `Token #${newlyCalled.token} — Please come to the salon now`
                },
                android: {
                    notification: {
                        sound: 'default',
                        priority: 'high'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default'
                        }
                    }
                }
            };

            try {
                await admin.messaging().send(message);
                console.log('Notification sent to token:',
                    newlyCalled.token);
            } catch (err) {
                console.log('FCM send error:', err);
            }

            return null;
        });
