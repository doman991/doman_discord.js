# My Discord Bot – Backup of SinusBot Scripts  

This Discord bot serves as a backup for my SinusBot scripts, ensuring they are stored and accessible for future use. While the bot itself doesn’t provide advanced functionalities, it acts as a repository to preserve and manage my scripts efficiently.  

## Purpose  
- **Backup & Storage:** Keeps my SinusBot scripts safe and organized.  
- **Easy Access:** Allows quick retrieval of scripts when needed.  
- **Version Control:** Helps track updates and modifications over time.  

This bot is primarily for personal use, ensuring my scripts remain secure and readily available whenever required. 🚀

## Cogs

### Timer  
The Timer cog enables administrators to set countdown timers directly in a Discord channel. Using the command `!timer <time> [optional message]`, an admin can trigger a countdown where the bot deletes the command message and posts a timestamped countdown in its place. The time must be between 5 seconds and 32 days, using units like `s` (seconds), `m` (minutes), `h` (hours), or `d` (days). Optionally, a custom message can be added. For example, `!timer 30m Break time ends!` starts a 30-minute countdown with the message "Break time ends!" This is perfect for reminders or event scheduling.

### Remove  
The Remove cog allows administrators to clean up a channel by deleting a specified number of messages. With the command `!remove <number>`, where `<number>` ranges from 1 to 100, the bot deletes that many messages before the command, logs the action in a designated log channel, and sends a confirmation message that auto-deletes after 2 seconds. For instance, `!remove 25` would remove the last 25 messages in the channel. This feature is useful for moderating chats while maintaining an action record.

### ClipOnly  
The ClipOnly cog enforces a video-only rule in a specific channel. When a message contains a video attachment (e.g., mp4, mov, webm, avi, or mkv), the bot reacts with a ✅ emoji to approve it. Messages without video attachments are scheduled for deletion after a configurable delay (default is 1 hour), with the action logged in a debug channel. If a message is manually deleted, the bot also cleans up the related log entry. This keeps the channel focused on video clips, automatically pruning unrelated content.

### AutoRanks  
The AutoRanks cog manages user roles through reactions to an embed message listing various games, each tied to a unique emoji. When a user reacts with a game’s emoji, they receive a role that likely provides notifications for updates about that game; removing the reaction revokes the role. The embed updates if it exists or is sent as a new message if it doesn’t. For example, reacting with the emoji for Minecraft assigns the Minecraft update notification role. This lets users self-manage their notification preferences effortlessly.
