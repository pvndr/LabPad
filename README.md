# 📓 LabPad

> **Offline-first engineering notebook for students.**

LabPad is a Progressive Web Application (PWA) that enables engineering students to securely store, organize, and access code snippets and notes anytime—even without an internet connection. Built with an **offline-first architecture**, LabPad seamlessly synchronizes local data with the cloud whenever connectivity is restored.

🌐 **Live Demo:** https://project-d81ht.vercel.app/

---

## ✨ Features

- 📶 Offline-first architecture
- ☁️ Automatic cloud synchronization with Supabase
- 💾 IndexedDB & localStorage caching
- 🔄 Intelligent conflict resolution using timestamps
- 📱 Installable Progressive Web App (PWA)
- 🌐 Real-time online/offline status detection
- 🔐 Room-based collaborative note management
- ⚡ Fast and responsive user experience

---

## 🏗️ Architecture

```text
                 User
                   │
                   ▼
          React Frontend (Vite)
                   │
      ┌────────────┴────────────┐
      ▼                         ▼
 IndexedDB / localStorage   Supabase Database
      │                         │
      └────── Sync Engine ──────┘
             (Conflict Resolution)
```

LabPad follows an **offline-first synchronization model**.

- Data is immediately available from local storage.
- Changes are saved locally for instant responsiveness.
- When internet connectivity is available, the application synchronizes data with Supabase.
- Timestamp-based conflict resolution ensures the latest version of each note is preserved.

---

## 🛠️ Tech Stack

### Frontend
- React 18
- Vite
- JavaScript
- HTML5
- CSS3

### Backend & Database
- Supabase
- PostgreSQL

### Offline Support
- Progressive Web App (PWA)
- Workbox
- IndexedDB
- localStorage

---

## 🚀 Getting Started

### Clone the repository

```bash
git clone https://github.com/pvndr/LabPad.git
```

### Navigate to the project

```bash
cd LabPad
```

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

---

## 📂 Project Structure

```text
LabPad/
├── src/
│   ├── components/
│   ├── lib/
│   ├── assets/
│   └── App.jsx
├── public/
├── vite.config.js
├── package.json
└── README.md
```

---

## 🔄 Offline Sync Workflow

1. User opens the application.
2. Notes load instantly from local storage.
3. If internet is available, LabPad connects to Supabase.
4. Local and cloud notes are compared.
5. The latest version of each note is preserved.
6. Any offline edits are automatically synchronized.

---

## 💡 Why LabPad?

Engineering students often lose internet access inside labs or examination environments. LabPad ensures that important notes and code snippets remain accessible at all times while automatically synchronizing changes once connectivity returns.

---

## 🔮 Future Enhancements

- Rich text editor
- Code syntax highlighting
- Markdown support
- Folder organization
- End-to-end encryption
- Shared collaborative workspaces
- Version history
- Cross-device synchronization improvements

---

## 👨‍💻 Author

**Pavan D R**

AI Software Engineer | Full Stack Developer

GitHub: https://github.com/pvndr

---

## 📄 License

This project is licensed under the MIT License.
