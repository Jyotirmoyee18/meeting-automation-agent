import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnNew =
    location.pathname === "/meeting/new" ||
    (location.pathname.startsWith("/meeting/") &&
      !location.pathname.endsWith("/details"));

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-8 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <i className="fas fa-wave-square text-white text-sm" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">VoxNote AI</h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {!isOnNew && (
          <button
            id="header-new-btn"
            onClick={() => navigate("/meeting/new")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
          >
            <i className="fas fa-plus" />
            New
          </button>
        )}
        {/* <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
            <i className="fas fa-user text-slate-500 text-sm" />
          </div>
        </div> */}
      </div>
    </header>
  );
};

export default Header;
