import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import TextField from "@mui/material/TextField";
import { Country, State } from "country-state-city";
import { usersApi } from "../../api/users.api";

const normalizeLocation = (value) => {
  if (!value) return { country: "", province: "" };
  if (typeof value === "string") {
    return { country: "", province: String(value).trim() };
  }
  return {
    country: String(value.country || "").trim(),
    province: String(value.province || "").trim(),
  };
};

export default function BasicInfoModal({ isOpen, onClose, profile, accessToken, onSaved }) {
  const [gender, setGender] = useState("");
  const [birthday, setBirthday] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const countries = useMemo(() => Country.getAllCountries(), []);
  const states = useMemo(
    () => (countryCode ? State.getStatesOfCountry(countryCode) : []),
    [countryCode]
  );
  useEffect(() => {
    if (!isOpen) return;
    const birthdayValue = profile?.age ? String(profile.age).slice(0, 10) : "";
    const rawGender = profile?.gender ? String(profile.gender) : "";
    const normalizedGender = rawGender
      ? rawGender.charAt(0).toUpperCase() + rawGender.slice(1).toLowerCase()
      : "";
    const normalizedLocation = normalizeLocation(profile?.location);
    const matchedCountry = countries.find(
      (item) => item.name.toLowerCase() === normalizedLocation.country.toLowerCase()
    );
    const nextCountryCode = matchedCountry?.isoCode || "";
    const nextStates = nextCountryCode ? State.getStatesOfCountry(nextCountryCode) : [];
    const matchedState = nextStates.find(
      (item) => item.name.toLowerCase() === normalizedLocation.province.toLowerCase()
    );
    const nextStateCode = matchedState?.isoCode || "";
    setGender(normalizedGender);
    setBirthday(birthdayValue);
    setCountryCode(nextCountryCode);
    setStateCode(nextStateCode);
    setSaving(false);
    setErr("");
  }, [isOpen, profile, countries]);

  if (!isOpen) return null;

  const locationEmpty = !countryCode || !stateCode;

  const handleSave = async () => {
    if (!accessToken) {
      setErr("Missing access token.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      let nextBirthday = birthday;
      const selectedCountry = countries.find((item) => item.isoCode === countryCode);
      const selectedState = states.find((item) => item.isoCode === stateCode);
      const payload = {
        gender: gender ? String(gender).toLowerCase() : "",
        location: locationEmpty
          ? { country: "", province: "" }
          : {
              country: selectedCountry?.name || "",
              province: selectedState?.name || "",
            },
        birthday: nextBirthday || null,
      };
      const data = await usersApi.updateMe(accessToken, payload);
      if (data?.user) onSaved?.(data.user);
      onClose();
    } catch (e) {
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <div className="fw-semibold">Edit Basic Info</div>
          <button type="button" className="btn btn-sm btn-link" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="profile-modal-body">
          {err && <div className="alert alert-danger">{err}</div>}

          <div className="row g-3">
            <div className="col-12 col-md-6">
              <div className="profile-modal-row">
                <label className="form-label">Gender</label>
                <select
                  className="form-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Not set</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>
            </div>

            <div className="col-12 col-md-6">
              <div className="profile-modal-row">
                <label className="form-label">Birthday</label>
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <DatePicker
                    value={birthday ? dayjs(birthday) : null}
                    onChange={(newValue) => {
                      if (!newValue || !newValue.isValid()) {
                        setBirthday("");
                        return;
                      }
                      setBirthday(newValue.format("YYYY-MM-DD"));
                    }}
                    disableFuture
                    format="MM/DD/YYYY"
                    enableAccessibleFieldDOMStructure={false}
                    slots={{ textField: TextField }}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: "outlined",
                        size: "small",
                      },
                      field: { clearable: true },
                    }}
                  />
                </LocalizationProvider>
                <div className="profile-edit-helper">
                  Age is automatically computed from your birthday.
                </div>
              </div>
            </div>
          </div>

          <div className="row g-2">
            <div className="col-12">
              <label className="form-label mb-1">Location</label>
            </div>
            <div className="col-12 col-md-6">
              <div className="profile-modal-row">
                <label className="form-label">Country</label>
                <select
                  className="form-select"
                  value={countryCode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCountryCode(next);
                    setStateCode("");
                  }}
                >
                  <option value="">Select country</option>
                  {countries.map((item) => (
                    <option key={item.isoCode} value={item.isoCode}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="profile-modal-row">
                <label className="form-label">Province / State</label>
                <select
                  className="form-select"
                  value={stateCode}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStateCode(next);
                  }}
                  disabled={!countryCode}
                >
                  <option value="">Select province</option>
                  {states.map((item) => (
                    <option key={item.isoCode} value={item.isoCode}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

        </div>

        <div className="profile-modal-footer">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-dark"
            onClick={handleSave}
            disabled={saving || locationEmpty}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function calcAge(birthday) {
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return Math.max(age, 0);
}
