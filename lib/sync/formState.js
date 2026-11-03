// The bookkeeping of the "tag a business" form, as plain functions so it can be tested
// without a browser. Choosing a thread fills the form in (a name and an area, taken from
// the thread's title), and removing that choice must take back exactly that, and nothing
// the admin typed since.

export const NO_PREFILL = { name: "", area: "" };

// "Himal Brew House, Jhamsikhel" -> the name and the area, as a starting point.
export function splitTitle(title) {
  const text = (title ?? "").toString();
  const cut = text.lastIndexOf(",");
  if (cut < 0) return { name: text.trim(), area: "" };
  return { name: text.slice(0, cut).trim(), area: text.slice(cut + 1).trim() };
}

// Choosing an existing thread. Fills in only what is still empty, and remembers exactly
// what it filled in.
export function chooseThread(form, thread) {
  const { name, area } = splitTitle(thread && thread.title);
  const fillName = !form.businessName && Boolean(name);
  const fillArea = !form.area && Boolean(area);
  return {
    form: {
      businessName: fillName ? name : form.businessName,
      area: fillArea ? area : form.area
    },
    prefill: { name: fillName ? name : "", area: fillArea ? area : "" }
  };
}

// Removing the choice (or starting a new thread instead): take back what choosing filled
// in, but only where it is still exactly as it was filled. Anything the admin typed or
// changed since stays.
export function unlinkThread(form, prefill) {
  if (!prefill) return { form, prefill: NO_PREFILL };
  return {
    form: {
      businessName: prefill.name && form.businessName === prefill.name ? "" : form.businessName,
      area: prefill.area && form.area === prefill.area ? "" : form.area
    },
    prefill: NO_PREFILL
  };
}
