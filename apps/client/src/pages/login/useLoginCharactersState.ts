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

  return {
    charactersProps: {
      hasPassword: password.length > 0,
      isUsernameFocused,
      showPassword,
    },
    formProps: {
      onPasswordChange: handlePasswordChange,
      onPasswordVisibilityChange: setShowPassword,
      onUsernameBlur: handleUsernameBlur,
      onUsernameFocus: handleUsernameFocus,
    },
  }
}
