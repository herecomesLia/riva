import { useState } from "react"

export function useLoginCharactersState() {
  const [showPassword, setShowPassword] = useState(false)
  const [isUsernameFocused, setIsUsernameFocused] = useState(false)
  const [password, setPassword] = useState("")

  function handleUsernameFocus() {
    setIsUsernameFocused(true)
  }

  function handleUsernameBlur() {
    setIsUsernameFocused(false)
  }

  function handlePasswordChange(nextPassword: string) {
    setPassword(nextPassword)
  }

  function togglePasswordVisibility() {
    setShowPassword((current) => !current)
  }

  return {
    charactersProps: {
      hasPassword: password.length > 0,
      isUsernameFocused,
      showPassword,
    },
    formProps: {
      onPasswordChange: handlePasswordChange,
      onPasswordVisibilityToggle: togglePasswordVisibility,
      onUsernameBlur: handleUsernameBlur,
      onUsernameFocus: handleUsernameFocus,
      showPassword,
    },
  }
}
